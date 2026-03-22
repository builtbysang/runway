/**
 * Runway — Notion API skill
 * Reads a project context page and compresses it to ~300 tokens for Dev Agent
 */

const NOTION_API = 'https://api.notion.com/v1'
const NOTION_VERSION = '2022-06-28'

// Module-level cache — survives warm Vercel instance restarts (up to 10 min TTL)
const cache = new Map<string, { text: string; expiresAt: number }>()
const CACHE_TTL_MS = 10 * 60 * 1000 // 10 minutes

function notionHeaders() {
  return {
    Authorization: `Bearer ${process.env.NOTION_TOKEN || ''}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  }
}

type NotionBlock = {
  id?: string
  type: string
  [key: string]: unknown
}

interface NotionBlocksResponse {
  results: NotionBlock[]
}

type NotionRichText = { type: 'text'; text: { content: string } }
type NotionAppendBlock = {
  object: 'block'
  type: 'paragraph' | 'heading_1' | 'heading_2' | 'heading_3' | 'bulleted_list_item' | 'divider'
  paragraph?: { rich_text: NotionRichText[] }
  heading_1?: { rich_text: NotionRichText[] }
  heading_2?: { rich_text: NotionRichText[] }
  heading_3?: { rich_text: NotionRichText[] }
  bulleted_list_item?: { rich_text: NotionRichText[] }
  divider?: Record<string, never>
}

/** Convert a Notion block to plain text (single line) */
function blockToText(block: NotionBlock): string {
  const type = block.type
  const content = block[type] as Record<string, unknown> | undefined
  if (!content) return ''

  // Rich text blocks
  const richTextTypes = [
    'paragraph', 'heading_1', 'heading_2', 'heading_3',
    'bulleted_list_item', 'numbered_list_item', 'quote', 'callout',
    'toggle',
  ]
  if (richTextTypes.includes(type)) {
    const richText = content.rich_text as Array<{ plain_text: string }> | undefined
    const text = richText?.map((t) => t.plain_text).join('') || ''
    if (!text.trim()) return ''

    if (type === 'heading_1') return `# ${text}`
    if (type === 'heading_2') return `## ${text}`
    if (type === 'heading_3') return `### ${text}`
    if (type === 'bulleted_list_item') return `- ${text}`
    if (type === 'numbered_list_item') return `• ${text}`
    return text
  }

  if (type === 'divider') return '---'
  if (type === 'code') {
    const richText = (content.rich_text as Array<{ plain_text: string }> | undefined)
      ?.map((t) => t.plain_text).join('') || ''
    return `\`${richText}\``
  }

  return ''
}

/** Fetch all blocks from a Notion page (flat, no recursion needed for context pages) */
async function fetchBlocks(pageId: string): Promise<NotionBlock[]> {
  const res = await fetch(`${NOTION_API}/blocks/${pageId}/children?page_size=100`, {
    headers: notionHeaders(),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Notion API error ${res.status}: ${err}`)
  }
  const data = await res.json() as NotionBlocksResponse
  return data.results
}

async function archiveBlock(blockId: string): Promise<void> {
  const res = await fetch(`${NOTION_API}/blocks/${blockId}`, {
    method: 'PATCH',
    headers: notionHeaders(),
    body: JSON.stringify({ archived: true }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Notion archive block error ${res.status}: ${err}`)
  }
}

function richText(content: string): NotionRichText[] {
  return content ? [{ type: 'text', text: { content } }] : []
}

function markdownToBlocks(markdown: string): NotionAppendBlock[] {
  const lines = markdown.split(/\r?\n/)
  const blocks: NotionAppendBlock[] = []

  for (const line of lines) {
    const trimmed = line.trim()

    if (!trimmed) {
      continue
    }

    if (trimmed === '---') {
      blocks.push({ object: 'block', type: 'divider', divider: {} })
      continue
    }

    if (trimmed.startsWith('### ')) {
      blocks.push({
        object: 'block',
        type: 'heading_3',
        heading_3: { rich_text: richText(trimmed.slice(4)) },
      })
      continue
    }

    if (trimmed.startsWith('## ')) {
      blocks.push({
        object: 'block',
        type: 'heading_2',
        heading_2: { rich_text: richText(trimmed.slice(3)) },
      })
      continue
    }

    if (trimmed.startsWith('# ')) {
      blocks.push({
        object: 'block',
        type: 'heading_1',
        heading_1: { rich_text: richText(trimmed.slice(2)) },
      })
      continue
    }

    if (trimmed.startsWith('- ')) {
      blocks.push({
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: { rich_text: richText(trimmed.slice(2)) },
      })
      continue
    }

    blocks.push({
      object: 'block',
      type: 'paragraph',
      paragraph: { rich_text: richText(trimmed) },
    })
  }

  return blocks
}

async function appendBlocks(pageId: string, blocks: NotionAppendBlock[]): Promise<void> {
  for (let index = 0; index < blocks.length; index += 100) {
    const chunk = blocks.slice(index, index + 100)
    const res = await fetch(`${NOTION_API}/blocks/${pageId}/children`, {
      method: 'PATCH',
      headers: notionHeaders(),
      body: JSON.stringify({ children: chunk }),
    })
    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Notion append blocks error ${res.status}: ${err}`)
    }
  }
}

/**
 * Compress a Notion page into a concise project context string.
 * Targets ~300-500 tokens — only the information Claude needs to code well.
 * 
 * Looks for sections: Goal / Tech Stack / Conventions / Non-goals / Out of Scope
 * Falls back to first 800 chars of page if no structured sections found.
 */
function compressToContext(blocks: NotionBlock[]): string {
  const lines = blocks.map(blockToText).filter(Boolean)
  const full = lines.join('\n')

  // If the page is short enough already, return as-is
  if (full.length <= 800) return full

  // Extract key sections by heading keywords
  const KEEP_SECTIONS = [
    'goal', 'mục tiêu', 'tech stack', 'công nghệ',
    'convention', 'pattern', 'coding', 'architecture',
    'non-goal', 'out of scope', 'ngoài phạm vi',
    'tldr', 'tl;dr', 'summary', 'tóm tắt',
  ]

  const sections: string[] = []
  let currentSection: string[] = []
  let inKeepSection = false

  for (const line of lines) {
    const isHeading = line.startsWith('#')
    if (isHeading) {
      // Save previous section if it was a keep section
      if (inKeepSection && currentSection.length > 0) {
        sections.push(currentSection.join('\n'))
      }
      currentSection = [line]
      inKeepSection = KEEP_SECTIONS.some((kw) => line.toLowerCase().includes(kw))
    } else {
      currentSection.push(line)
    }
  }
  // Last section
  if (inKeepSection && currentSection.length > 0) {
    sections.push(currentSection.join('\n'))
  }

  if (sections.length > 0) {
    const compressed = sections.join('\n\n')
    // Hard cap at 1200 chars (~300 tokens)
    return compressed.length > 1200 ? compressed.slice(0, 1200) + '…' : compressed
  }

  // Fallback: first 800 chars
  return full.slice(0, 800) + (full.length > 800 ? '…' : '')
}

/**
 * Read and cache a Notion page as compact project context.
 * Returns null if NOTION_TOKEN is not set or page can't be read.
 */
export async function readProjectContext(pageId: string): Promise<string | null> {
  if (!process.env.NOTION_TOKEN || !pageId) return null

  // Check cache
  const cached = cache.get(pageId)
  if (cached && cached.expiresAt > Date.now()) {
    console.log(`[Notion] Cache hit for ${pageId}`)
    return cached.text
  }

  try {
    console.log(`[Notion] Fetching context page ${pageId}`)
    const blocks = await fetchBlocks(pageId)
    const text = compressToContext(blocks)
    cache.set(pageId, { text, expiresAt: Date.now() + CACHE_TTL_MS })
    return text
  } catch (err) {
    console.warn(`[Notion] Could not read context page: ${err}`)
    return null
  }
}

export async function replacePageContent(pageId: string, markdown: string): Promise<void> {
  if (!process.env.NOTION_TOKEN || !pageId) {
    throw new Error('Missing NOTION_TOKEN or pageId')
  }

  const blocks = await fetchBlocks(pageId)
  await Promise.all(
    blocks
      .map((block) => block.id)
      .filter((id): id is string => Boolean(id))
      .map((id) => archiveBlock(id)),
  )

  const children = markdownToBlocks(markdown)
  if (children.length > 0) {
    await appendBlocks(pageId, children)
  }

  cache.delete(pageId)
}
