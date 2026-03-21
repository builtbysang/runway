/**
 * Runway — Notion API skill
 * Create pages, append blocks, convert markdown to Notion block format
 */

const NOTION_API = 'https://api.notion.com/v1'
const NOTION_VERSION = '2022-06-28'

function notionHeaders() {
  return {
    Authorization: `Bearer ${process.env.NOTION_API_KEY}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  }
}

async function notionFetch(path: string, method: string, body?: unknown) {
  const res = await fetch(`${NOTION_API}${path}`, {
    method,
    headers: notionHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json()
  if (!res.ok) throw new Error(`Notion API error: ${JSON.stringify(json)}`)
  return json
}

// ─── Block builders ────────────────────────────────────────────────────────────

type RichText = { type: 'text'; text: { content: string }; annotations?: Record<string, boolean> }

function richText(content: string, annotations?: Record<string, boolean>): RichText {
  return { type: 'text', text: { content }, ...(annotations ? { annotations } : {}) }
}

export function paragraph(text: string) {
  return { object: 'block', type: 'paragraph', paragraph: { rich_text: [richText(text)] } }
}

export function heading1(text: string) {
  return { object: 'block', type: 'heading_1', heading_1: { rich_text: [richText(text)] } }
}

export function heading2(text: string) {
  return { object: 'block', type: 'heading_2', heading_2: { rich_text: [richText(text)] } }
}

export function heading3(text: string) {
  return { object: 'block', type: 'heading_3', heading_3: { rich_text: [richText(text)] } }
}

export function bulletItem(text: string) {
  return {
    object: 'block',
    type: 'bulleted_list_item',
    bulleted_list_item: { rich_text: [richText(text)] },
  }
}

export function todoItem(text: string, checked = false) {
  return {
    object: 'block',
    type: 'to_do',
    to_do: { rich_text: [richText(text)], checked },
  }
}

export function divider() {
  return { object: 'block', type: 'divider', divider: {} }
}

export function callout(text: string, emoji = '📋') {
  return {
    object: 'block',
    type: 'callout',
    callout: {
      rich_text: [richText(text)],
      icon: { type: 'emoji', emoji },
      color: 'gray_background',
    },
  }
}

export function quote(text: string) {
  return { object: 'block', type: 'quote', quote: { rich_text: [richText(text)] } }
}

// ─── Markdown → Notion blocks ──────────────────────────────────────────────────

/**
 * Converts a markdown string to an array of Notion blocks.
 * Handles: headings, bullets, checkboxes, paragraphs, horizontal rules, blockquotes.
 * Tables and code blocks are rendered as paragraphs (Notion table API is complex).
 */
export function markdownToBlocks(markdown: string): object[] {
  const lines = markdown.split('\n')
  const blocks: object[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Skip empty lines
    if (line.trim() === '') { i++; continue }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      blocks.push(divider())
      i++
      continue
    }

    // Headings
    if (line.startsWith('# ')) { blocks.push(heading1(line.slice(2).trim())); i++; continue }
    if (line.startsWith('## ')) { blocks.push(heading2(line.slice(3).trim())); i++; continue }
    if (line.startsWith('### ')) { blocks.push(heading3(line.slice(4).trim())); i++; continue }

    // Checkboxes
    if (/^- \[[ x]\]/.test(line)) {
      const checked = line[3] === 'x'
      blocks.push(todoItem(line.slice(6).trim(), checked))
      i++
      continue
    }

    // Bullets
    if (/^[-*] /.test(line)) {
      blocks.push(bulletItem(line.slice(2).trim()))
      i++
      continue
    }

    // Blockquote
    if (line.startsWith('> ')) {
      blocks.push(quote(line.slice(2).trim()))
      i++
      continue
    }

    // Table rows — render as paragraph (simplified)
    if (line.startsWith('|')) {
      // Skip table separator rows (|---|---|)
      if (/^\|[\s\-|]+\|$/.test(line.trim())) { i++; continue }
      const cells = line.split('|').filter(Boolean).map((c) => c.trim()).join(' · ')
      blocks.push(paragraph(cells))
      i++
      continue
    }

    // Code block — collect lines and render as paragraph with backtick label
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim()
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      i++ // skip closing ```
      if (codeLines.length > 0) {
        const preview = codeLines.slice(0, 5).join('\n')
        blocks.push({
          object: 'block',
          type: 'code',
          code: {
            rich_text: [{ type: 'text', text: { content: preview } }],
            language: lang || 'plain text',
          },
        })
      }
      continue
    }

    // Regular paragraph — strip bold/italic markers for simplicity
    const text = line.replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1').trim()
    if (text) blocks.push(paragraph(text))
    i++
  }

  return blocks
}

// ─── Page operations ───────────────────────────────────────────────────────────

export async function createNotionPage(opts: {
  parentId: string
  parentType: 'page' | 'database'
  title: string
  blocks: object[]
}): Promise<{ id: string; url: string }> {
  const parent =
    opts.parentType === 'database'
      ? { database_id: opts.parentId }
      : { page_id: opts.parentId }

  const firstBatch = opts.blocks.slice(0, 100)

  const page = await notionFetch('/pages', 'POST', {
    parent,
    properties: {
      title: { title: [{ text: { content: opts.title } }] },
    },
    children: firstBatch,
  })

  // Append remaining blocks in batches of 100
  if (opts.blocks.length > 100) {
    await appendNotionBlocks(page.id, opts.blocks.slice(100))
  }

  const url = `https://www.notion.so/${page.id.replace(/-/g, '')}`
  return { id: page.id, url }
}

export async function appendNotionBlocks(pageId: string, blocks: object[]): Promise<void> {
  for (let i = 0; i < blocks.length; i += 100) {
    const batch = blocks.slice(i, i + 100)
    await notionFetch(`/blocks/${pageId}/children`, 'PATCH', { children: batch })
  }
}

export async function getNotionDatabase(databaseId: string) {
  return notionFetch(`/databases/${databaseId}`, 'GET')
}
