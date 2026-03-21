/**
 * Runway — Claude API skill
 *
 * Dev mode: agentic tool-use loop
 *   Claude calls read_file / list_dir / write_file / done tools
 *   → no pre-fetching files, no JSON parsing, Claude decides what to read
 *
 * PM mode: analyze PRD → roadmap JSON (one-shot, sonnet)
 * Doc mode: draft Brief/PRD markdown (one-shot, sonnet)
 *
 * Token optimization:
 *   - Tool-use loop: Claude reads only what it needs
 *   - Model selected by Linear labels (haiku/sonnet/opus)
 *   - Thinking only for [complex] issues
 */
import Anthropic from '@anthropic-ai/sdk'
import { readFile, readDir, createBranchAndPR } from '@/skills/github'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ─── Model selection ──────────────────────────────────────────────────────────

type Complexity = 'simple' | 'normal' | 'complex'

const COMPLEX_LABELS = ['complex', 'hard', 'large', 'xl']
const SIMPLE_LABELS  = ['simple', 'easy', 'small', 'xs', 'trivial']

export function detectComplexity(title: string, description: string, labels: string[] = []): Complexity {
  const lnames = labels.map(l => l.toLowerCase())
  if (lnames.some(l => COMPLEX_LABELS.includes(l))) return 'complex'
  if (lnames.some(l => SIMPLE_LABELS.includes(l)))  return 'simple'
  const text = `${title} ${description}`.toLowerCase()
  if (text.includes('[complex]') || text.includes('[hard]')) return 'complex'
  if (!description || description.length < 80) return 'simple'
  if (description.length > 600) return 'complex'
  return 'normal'
}

const MODELS: Record<Complexity, string> = {
  simple:  'claude-haiku-4-5-20251001',
  normal:  'claude-sonnet-4-5-20251001',
  complex: 'claude-opus-4-6',
}

// ─── Tool definitions given to Claude ────────────────────────────────────────

const DEV_TOOLS: Anthropic.Tool[] = [
  {
    name: 'read_file',
    description: 'Read a source file from the GitHub repository. Call this to understand existing code before making changes.',
    input_schema: {
      type: 'object' as const,
      properties: { path: { type: 'string', description: 'Relative file path, e.g. app/page.tsx' } },
      required: ['path'],
    },
  },
  {
    name: 'list_dir',
    description: 'List files and folders inside a directory in the repository.',
    input_schema: {
      type: 'object' as const,
      properties: { path: { type: 'string', description: 'Directory path, e.g. app/ or components/' } },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: 'Stage a file change. Call this once per file you want to create or modify. Use FULL file content.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path:    { type: 'string', description: 'Relative file path' },
        content: { type: 'string', description: 'Complete new file content' },
        reason:  { type: 'string', description: 'One sentence explaining this change' },
      },
      required: ['path', 'content', 'reason'],
    },
  },
  {
    name: 'done',
    description: 'Signal that you have finished implementing. Call this when all write_file calls are done.',
    input_schema: {
      type: 'object' as const,
      properties: {
        summary:       { type: 'string', description: 'One paragraph summary of what was implemented' },
        prDescription: { type: 'string', description: 'PR description in markdown: ## What, ## Why, ## How to test' },
      },
      required: ['summary', 'prDescription'],
    },
  },
]

// ─── Dev Agent — agentic tool-use loop ───────────────────────────────────────

export interface DevResult {
  changes: { path: string; content: string; reason: string }[]
  summary: string
  prDescription: string
}

export async function implementIssue(opts: {
  issueTitle: string
  issueDescription: string
  repo: string
  token: string
  techStack?: string
  projectContext?: string
  labels?: string[]
}): Promise<DevResult> {
  const complexity = detectComplexity(opts.issueTitle, opts.issueDescription, opts.labels)
  const model = MODELS[complexity]
  console.log(`[Claude] model=${model} complexity=${complexity}`)

  const contextSection = opts.projectContext
    ? `## Project context\n${opts.projectContext}\n\n`
    : ''

  const systemPrompt = `You are an expert ${opts.techStack || 'Next.js / TypeScript'} developer implementing a Linear issue.

${contextSection}Use the tools to explore the codebase and implement the task:
1. Call read_file or list_dir to understand existing code — only read what you need
2. Call write_file for each file you want to change (full file content, not diffs)
3. Call done when finished — do NOT call done until all write_file calls are complete

Be surgical: change only what's needed. If you cannot safely implement, call done with no prior write_file calls and explain in summary.`

  const messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content: `Implement this issue:\n\n**${opts.issueTitle}**\n\n${opts.issueDescription || '(no description)'}`,
    },
  ]

  const changes: DevResult['changes'] = []
  let summary = ''
  let prDescription = ''
  let iterations = 0
  const MAX_ITER = 20 // safety limit

  while (iterations++ < MAX_ITER) {
    const response = await client.messages.create({
      model,
      max_tokens: 8192,
      system: systemPrompt,
      tools: DEV_TOOLS,
      messages,
    })

    // Append assistant turn
    messages.push({ role: 'assistant', content: response.content })

    if (response.stop_reason === 'end_turn') break

    if (response.stop_reason === 'tool_use') {
      const toolUseBlocks = response.content.filter(b => b.type === 'tool_use') as Anthropic.ToolUseBlock[]
      const toolResults: Anthropic.ToolResultBlockParam[] = []

      for (const block of toolUseBlocks) {
        const input = block.input as Record<string, string>
        let result = ''

        if (block.name === 'read_file') {
          console.log(`[Claude] read_file: ${input.path}`)
          const file = await readFile(opts.repo, input.path, opts.token)
          result = file ? file.content : `File not found: ${input.path}`
        }

        else if (block.name === 'list_dir') {
          console.log(`[Claude] list_dir: ${input.path}`)
          const entries = await readDir(opts.repo, input.path, opts.token)
          result = entries.length > 0 ? entries.join('\n') : `Empty or not found: ${input.path}`
        }

        else if (block.name === 'write_file') {
          console.log(`[Claude] write_file: ${input.path}`)
          changes.push({ path: input.path, content: input.content, reason: input.reason })
          result = `Staged: ${input.path}`
        }

        else if (block.name === 'done') {
          summary = input.summary
          prDescription = input.prDescription
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: 'Done acknowledged.' })
          messages.push({ role: 'user', content: toolResults })
          return { changes, summary, prDescription }
        }

        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result })
      }

      messages.push({ role: 'user', content: toolResults })
    }
  }

  return { changes, summary: summary || 'Implementation loop ended without done signal.', prDescription }
}

// ─── PM Agent ────────────────────────────────────────────────────────────────

export interface Roadmap {
  projectName: string
  projectDescription: string
  releases: {
    name: string
    description: string
    sprints: {
      name: string
      goal: string
      startWeek: number
      durationWeeks: number
      issues: { title: string; description: string; priority: 1|2|3|4; estimate: number; epic: string }[]
    }[]
  }[]
}

export async function analyzePRD(prd: string): Promise<Roadmap> {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-5-20251001',
    max_tokens: 6000,
    messages: [{
      role: 'user',
      content: `You are a senior PM. Analyze this PRD and return ONLY a JSON roadmap (no markdown).

PRD:
${prd}

JSON shape:
{"projectName":"string","projectDescription":"string","releases":[{"name":"Release 1 — MVP","description":"string","sprints":[{"name":"Sprint 1","goal":"string","startWeek":0,"durationWeeks":2,"issues":[{"title":"string","description":"acceptance criteria","priority":2,"estimate":3,"epic":"string"}]}]}]}

Rules: R1=MVP only, R2=Growth, max 8 issues/sprint, priority 1-4 (1=P0), estimate in story points.`,
    }],
  })
  const text = response.content.find(b => b.type === 'text')
  if (!text || text.type !== 'text') throw new Error('No response')
  const raw = text.text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
  return JSON.parse(raw) as Roadmap
}

// ─── Doc Agent ────────────────────────────────────────────────────────────────

export type DocType = 'brief' | 'prd'
export interface DocumentDraft { title: string; docType: DocType; markdown: string }

export async function draftDocument(opts: { context: string; docType: DocType }): Promise<DocumentDraft> {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-5-20251001',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: `Write a ${opts.docType === 'brief' ? 'Project Brief' : 'PRD'} from this context. Return ONLY JSON: {"title":"string","markdown":"string"}

Context:
${opts.context}`,
    }],
  })
  const text = response.content.find(b => b.type === 'text')
  if (!text || text.type !== 'text') throw new Error('No response')
  const raw = text.text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
  const parsed = JSON.parse(raw) as { title: string; markdown: string }
  return { title: parsed.title, docType: opts.docType, markdown: parsed.markdown }
}
