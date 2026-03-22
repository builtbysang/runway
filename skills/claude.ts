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

// ─── Refine Agent ─────────────────────────────────────────────────────────────

export interface RefinedIssue {
  issueId: string
  description: string   // enriched markdown with ## Acceptance Criteria section
  estimate: number      // story points: 1/2/3/5/8
  complexity: 'simple' | 'normal' | 'complex'
  summary: string       // one line describing what was added
}

/**
 * Enrich backlog issues: Claude reads the repo structure and adds AC,
 * story-point estimates, and complexity classifications.
 */
export async function refineIssues(opts: {
  issues: { id: string; identifier: string; title: string; description: string | null }[]
  repo: string
  token: string
  techStack?: string
  projectContext?: string
}): Promise<RefinedIssue[]> {
  const dirListing = await readDir(opts.repo, '', opts.token)
  const contextSection = opts.projectContext
    ? `## Project context\n${opts.projectContext}\n\n`
    : ''

  const issueList = opts.issues
    .map(i => `**${i.identifier} (id: ${i.id})**: ${i.title}\n${i.description || '(no description)'}`)
    .join('\n\n---\n\n')

  const response = await client.messages.create({
    model: 'claude-sonnet-4-5-20251001',
    max_tokens: 8000,
    messages: [{
      role: 'user',
      content: `You are a senior PM and tech lead. Refine these Linear issues for a ${opts.techStack || 'Next.js'} project.

${contextSection}Repository top-level structure:
${dirListing.slice(0, 40).join('\n')}

For each issue produce:
1. Enriched description with an "## Acceptance Criteria" section (bullet list)
2. Story points: 1 (trivial <1h), 2 (small ~2h), 3 (medium ~half day), 5 (large ~1 day), 8 (very large >1 day)
3. Complexity: simple | normal | complex

Issues to refine:
${issueList}

Return ONLY a JSON array (no markdown fences):
[{"issueId":"<exact issue id>","description":"<full markdown>","estimate":<number>,"complexity":"<simple|normal|complex>","summary":"<one line>"}]`,
    }],
  })

  const text = response.content.find(b => b.type === 'text')
  if (!text || text.type !== 'text') throw new Error('No response from Claude')
  const raw = text.text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
  return JSON.parse(raw) as RefinedIssue[]
}

// ─── Sprint Review Agent ──────────────────────────────────────────────────────

export interface SprintReview {
  sprintName: string
  velocity: number           // story points completed
  plannedVelocity: number    // total story points in sprint
  completionRate: number     // percentage 0-100
  summary: string            // 2-3 sentence retrospective
  recommendations: string[]  // 3-5 action items
  carryOvers: { issueId: string; reason: string }[]
}

export async function generateSprintReview(opts: {
  sprintName: string
  doneIssues: { id: string; identifier: string; title: string; estimate?: number }[]
  notDoneIssues: { id: string; identifier: string; title: string; estimate?: number }[]
}): Promise<SprintReview> {
  const velocity = opts.doneIssues.reduce((s, i) => s + (i.estimate ?? 0), 0)
  const remainingPts = opts.notDoneIssues.reduce((s, i) => s + (i.estimate ?? 0), 0)
  const plannedVelocity = velocity + remainingPts

  const doneText = opts.doneIssues.length
    ? opts.doneIssues.map(i => `- ${i.identifier}: ${i.title} (${i.estimate ?? 0}pts)`).join('\n')
    : '(none)'
  const notDoneText = opts.notDoneIssues.length
    ? opts.notDoneIssues.map(i => `- ${i.id} | ${i.identifier}: ${i.title} (${i.estimate ?? 0}pts)`).join('\n')
    : '(none)'

  const response = await client.messages.create({
    model: 'claude-sonnet-4-5-20251001',
    max_tokens: 2000,
    messages: [{
      role: 'user',
      content: `Generate a sprint retrospective for ${opts.sprintName}.

Completed (${opts.doneIssues.length} issues, ${velocity}pts):
${doneText}

Not completed (${opts.notDoneIssues.length} issues, ${remainingPts}pts):
${notDoneText}

Return ONLY JSON (no markdown fences):
{"summary":"2-3 sentences","recommendations":["action 1","action 2","action 3"],"carryOvers":[{"issueId":"<exact id from not-done list>","reason":"why this should be first next sprint"}]}

carryOvers = high-priority incomplete issues that must be done first next sprint. issueId must match the id field in the not-done list above.`,
    }],
  })

  const text = response.content.find(b => b.type === 'text')
  if (!text || text.type !== 'text') throw new Error('No response')
  const raw = text.text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
  const parsed = JSON.parse(raw) as {
    summary: string
    recommendations: string[]
    carryOvers: { issueId: string; reason: string }[]
  }

  return {
    sprintName: opts.sprintName,
    velocity,
    plannedVelocity,
    completionRate: plannedVelocity > 0 ? Math.round((velocity / plannedVelocity) * 100) : 100,
    ...parsed,
  }
}

// ─── Progress Report ──────────────────────────────────────────────────────────

/** Build a markdown progress report from a list of issues */
export function buildProgressReport(opts: {
  projectName: string
  sprintName?: string
  issues: { identifier: string; title: string; state: { name: string }; estimate?: number; priority: number }[]
}): string {
  const total = opts.issues.length
  const done = opts.issues.filter(i => i.state.name.toLowerCase() === 'done').length
  const inProgress = opts.issues.filter(i => i.state.name.toLowerCase() === 'in progress').length
  const todo = opts.issues.filter(i => ['todo', 'backlog'].includes(i.state.name.toLowerCase())).length
  const inReview = opts.issues.filter(i => i.state.name.toLowerCase() === 'in review').length

  const donePoints = opts.issues
    .filter(i => i.state.name.toLowerCase() === 'done')
    .reduce((s, i) => s + (i.estimate ?? 0), 0)
  const totalPoints = opts.issues.reduce((s, i) => s + (i.estimate ?? 0), 0)

  const priorityLabel = (p: number) => ['', '🔴 Urgent', '🟠 High', '🟡 Medium', '🔵 Low'][p] ?? '-'

  const rows = opts.issues
    .sort((a, b) => a.priority - b.priority)
    .map(i => `| ${i.identifier} | ${i.title.substring(0, 50).replace(/\|/g, '\\|')} | ${i.state.name} | ${priorityLabel(i.priority)} | ${i.estimate ?? '-'} |`)
    .join('\n')

  const heading = opts.sprintName
    ? `# 📊 ${opts.projectName} — ${opts.sprintName}`
    : `# 📊 ${opts.projectName}`

  return `${heading}

## Summary

| Metric | Value |
|--------|-------|
| Total issues | ${total} |
| ✅ Done | ${done} (${total > 0 ? Math.round((done / total) * 100) : 0}%) |
| 🔄 In Progress | ${inProgress} |
| 👀 In Review | ${inReview} |
| 📋 Todo | ${todo} |
| Story points | ${donePoints} / ${totalPoints}pts (${totalPoints > 0 ? Math.round((donePoints / totalPoints) * 100) : 0}%) |

## Issues

| ID | Title | Status | Priority | Pts |
|----|-------|--------|----------|-----|
${rows}

---
*Generated by Runway on ${new Date().toISOString().split('T')[0]}*`
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
