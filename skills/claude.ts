/**
 * Runway — Claude API skill
 * PM mode: analyze PRD → generate roadmap JSON
 * Dev mode: analyze issue + files → generate code changes JSON
 *
 * Token optimization:
 * - Model auto-selected by complexity (haiku → sonnet → opus)
 * - Thinking only enabled for [complex] issues
 * - Files truncated to 200 lines max
 */
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ─── Model selection ──────────────────────────────────────────────────────────
// haiku  = simple tasks, no description         (~$0.0008/1k tokens)
// sonnet = default                              (~$0.003/1k tokens)
// opus   = tagged [complex] or very long desc  (~$0.015/1k tokens)

type Complexity = 'simple' | 'normal' | 'complex'

function detectComplexity(title: string, description: string): Complexity {
  const text = `${title} ${description}`.toLowerCase()
  if (text.includes('[complex]') || text.includes('[hard]')) return 'complex'
  if (!description || description.length < 80) return 'simple'
  if (description.length > 600) return 'complex'
  return 'normal'
}

const MODELS: Record<Complexity, string> = {
  simple: 'claude-haiku-4-5',
  normal: 'claude-sonnet-4-5',
  complex: 'claude-opus-4-6',
}

const MAX_TOKENS: Record<Complexity, number> = {
  simple: 2048,
  normal: 4096,
  complex: 8192,
}

/** Truncate file content to first N lines, stripping blank-heavy sections */
function truncateFile(content: string, maxLines = 200): string {
  const lines = content.split('\n')
  if (lines.length <= maxLines) return content
  return lines.slice(0, maxLines).join('\n') + `\n// … (${lines.length - maxLines} more lines)`
}

// ─── PM Agent ─────────────────────────────────────────────────────────────────

export interface Sprint {
  name: string
  goal: string
  startWeek: number
  durationWeeks: number
  issues: {
    title: string
    description: string
    priority: 1 | 2 | 3 | 4
    estimate: number
    epic: string
  }[]
}

export interface Roadmap {
  projectName: string
  projectDescription: string
  releases: {
    name: string
    description: string
    sprints: Sprint[]
  }[]
}

export async function analyzePRD(prd: string): Promise<Roadmap> {
  // PRD analysis always uses sonnet — complex enough but no need for opus
  const response = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 6000,
    messages: [{
      role: 'user',
      content: `You are a senior PM. Analyze this PRD and return ONLY a JSON roadmap (no markdown).

PRD:
${prd}

JSON shape:
{
  "projectName": "string",
  "projectDescription": "string",
  "releases": [{
    "name": "Release 1 — MVP",
    "description": "string",
    "sprints": [{
      "name": "Sprint 1",
      "goal": "string",
      "startWeek": 0,
      "durationWeeks": 2,
      "issues": [{
        "title": "string",
        "description": "acceptance criteria",
        "priority": 2,
        "estimate": 3,
        "epic": "string"
      }]
    }]
  }]
}

Rules: R1=MVP only, R2=Growth, max 8 issues/sprint, priority 1-4 (1=P0), estimate in story points.`,
    }],
  })

  const text = response.content.find((b) => b.type === 'text')
  if (!text || text.type !== 'text') throw new Error('No response from Claude')
  const raw = text.text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
  return JSON.parse(raw) as Roadmap
}

// ─── Doc Agent ────────────────────────────────────────────────────────────────

export type DocType = 'brief' | 'prd'

export interface DocumentDraft {
  title: string
  docType: DocType
  markdown: string
}

export async function draftDocument(opts: {
  context: string
  docType: DocType
}): Promise<DocumentDraft> {
  const isBrief = opts.docType === 'brief'

  const structure = isBrief
    ? `# [Project Name]
**Status:** Draft | **Date:** ${new Date().toISOString().slice(0, 10)}
## The Problem
## Why Now
## Proposed Solution
## Target Users
## Success Metrics
## Scope (In / Out)
## Constraints & Dependencies
## Open Questions`
    : `# [Feature] — PRD
**Status:** Draft | **Created:** ${new Date().toISOString().slice(0, 10)}
## TL;DR
## 1. Background & Problem
## 2. Goals & Non-Goals + Success Metrics table
## 3. User Stories & Acceptance Criteria + Functional Requirements table
## 4. Design (Key Flows, States)
## 5. Technical Considerations
## 6. Launch Plan
## 7. Open Questions`

  const response = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: `Write a ${isBrief ? 'Project Brief' : 'PRD'} from this context. Return ONLY JSON: {"title":"string","markdown":"string"}

Structure to follow:
${structure}

Context:
${opts.context}`,
    }],
  })

  const text = response.content.find((b) => b.type === 'text')
  if (!text || text.type !== 'text') throw new Error('No response from Claude')
  const raw = text.text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
  const parsed = JSON.parse(raw) as { title: string; markdown: string }
  return { title: parsed.title, docType: opts.docType, markdown: parsed.markdown }
}

// ─── Dev Agent ────────────────────────────────────────────────────────────────

export interface CodeChange {
  path: string
  content: string
  reason: string
}

export interface DevResult {
  changes: CodeChange[]
  summary: string
  prDescription: string
}

export async function implementIssue(opts: {
  issueTitle: string
  issueDescription: string
  files: { path: string; content: string }[]
  techStack?: string
  projectContext?: string   // compressed Notion context (~300 tokens)
}): Promise<DevResult> {
  const complexity = detectComplexity(opts.issueTitle, opts.issueDescription)
  const model = MODELS[complexity]
  const maxTokens = MAX_TOKENS[complexity]
  const useThinking = complexity === 'complex'

  console.log(`[Claude] model=${model} complexity=${complexity} thinking=${useThinking}`)

  // Truncate files to save tokens
  const fileContext = opts.files
    .map((f) => `### ${f.path}\n\`\`\`\n${truncateFile(f.content)}\n\`\`\``)
    .join('\n\n')

  const contextSection = opts.projectContext
    ? `## Project context\n${opts.projectContext}\n\n`
    : ''

  const prompt = `You are an expert ${opts.techStack || 'Next.js / TypeScript'} developer.

${contextSection}## Task
**${opts.issueTitle}**
${opts.issueDescription ? `\n${opts.issueDescription}` : ''}

## Files
${fileContext || '(none provided)'}

Return ONLY JSON (no markdown):
{
  "changes": [{"path": "file.tsx", "content": "FULL file content", "reason": "one sentence"}],
  "summary": "one paragraph",
  "prDescription": "## What\\n...\\n## Why\\n...\\n## How to test\\n..."
}

Only change files needed. Return complete file content. If unsafe to implement, return changes:[] and explain in summary.`

  // Only add thinking for complex issues (costs extra tokens)
  const response = useThinking
    ? await client.messages.create({
        model,
        max_tokens: maxTokens,
        thinking: { type: 'enabled', budget_tokens: 2000 },
        messages: [{ role: 'user', content: prompt }],
      })
    : await client.messages.create({
        model,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      })

  const text = response.content.find((b) => b.type === 'text')
  if (!text || text.type !== 'text') throw new Error('No response from Claude')
  const raw = text.text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
  return JSON.parse(raw) as DevResult
}
