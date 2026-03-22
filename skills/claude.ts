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
import { readFile, readDir } from './github'
import { fetchLogoSvg, searchLogos } from './thesvg'

const anthropicClient = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null
const OPENAI_CHAT_COMPLETIONS_URL = 'https://api.openai.com/v1/chat/completions'

// ─── Model selection ──────────────────────────────────────────────────────────

type Complexity = 'simple' | 'normal' | 'complex'
export type Workstream = 'frontend' | 'backend' | 'fullstack'
type LlmProvider = 'anthropic' | 'openai'

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

const ANTHROPIC_MODELS: Record<Complexity, string> = {
  simple: 'claude-haiku-4-5-20251001',
  normal: 'claude-sonnet-4-5-20251001',
  complex: 'claude-opus-4-6',
}

const OPENAI_DEV_MODELS: Record<Complexity, string> = {
  simple: process.env.RUNWAY_OPENAI_DEV_MODEL_SIMPLE || 'gpt-5.1-codex-mini',
  normal: process.env.RUNWAY_OPENAI_DEV_MODEL_NORMAL || 'gpt-5.1-codex-mini',
  complex: process.env.RUNWAY_OPENAI_DEV_MODEL_COMPLEX || 'gpt-5.1-codex',
}

const DEV_MAX_TOKENS: Record<Complexity, number> = {
  simple: 2400,
  normal: 4200,
  complex: 6400,
}

const DEV_MAX_ITERATIONS: Record<Complexity, number> = {
  simple: 8,
  normal: 12,
  complex: 16,
}

// ─── Tool definitions given to Claude ────────────────────────────────────────

type ToolSchema = {
  type: 'object'
  properties: Record<string, { type: string; description: string }>
  required: string[]
}

type DevToolDefinition = {
  name: string
  description: string
  input_schema: ToolSchema
}

const DEV_TOOLS: DevToolDefinition[] = [
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
  {
    name: 'search_logo',
    description: 'Search theSVG for a brand or product logo before adding SVG assets to the implementation.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Brand or product name, e.g. github or openai' },
      },
      required: ['query'],
    },
  },
  {
    name: 'fetch_logo_svg',
    description: 'Fetch a raw SVG logo from theSVG using a known slug and optional variant.',
    input_schema: {
      type: 'object' as const,
      properties: {
        slug: { type: 'string', description: 'theSVG slug, e.g. github' },
        variant: { type: 'string', description: 'Variant key, usually default, mono, light, dark, wordmark' },
      },
      required: ['slug'],
    },
  },
]

function getLlmProvider(): LlmProvider {
  const configured = process.env.RUNWAY_LLM_PROVIDER?.toLowerCase()
  if (configured === 'openai') return 'openai'
  if (configured === 'anthropic') return 'anthropic'
  if (process.env.OPENAI_API_KEY) return 'openai'
  return 'anthropic'
}

export function hasLlmCredentials(): boolean {
  const provider = getLlmProvider()
  return provider === 'openai'
    ? Boolean(process.env.OPENAI_API_KEY)
    : Boolean(process.env.ANTHROPIC_API_KEY)
}

async function openAIChatCompletion(body: Record<string, unknown>) {
  const response = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY || ''}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`OpenAI chat completion failed: ${response.status} ${errorText}`)
  }

  return response.json() as Promise<Record<string, any>>
}

async function generateStructuredText(opts: {
  anthropicModel: string
  openaiModel?: string
  maxTokens: number
  userPrompt: string
}): Promise<string> {
  const provider = getLlmProvider()

  if (provider === 'openai') {
    const response = await openAIChatCompletion({
      model: opts.openaiModel || process.env.RUNWAY_OPENAI_TEXT_MODEL || 'gpt-5-mini',
      messages: [{ role: 'user', content: opts.userPrompt }],
      max_completion_tokens: opts.maxTokens,
      response_format: { type: 'json_object' },
    })

    return response.choices?.[0]?.message?.content || ''
  }

  if (!anthropicClient) {
    throw new Error('Missing ANTHROPIC_API_KEY')
  }

  const response = await anthropicClient.messages.create({
    model: opts.anthropicModel,
    max_tokens: opts.maxTokens,
    messages: [{ role: 'user', content: opts.userPrompt }],
  })

  const text = response.content.find((block) => block.type === 'text')
  if (!text || text.type !== 'text') throw new Error('No response')
  return text.text
}

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
  const provider = getLlmProvider()
  const complexity = detectComplexity(opts.issueTitle, opts.issueDescription, opts.labels)
  const model = provider === 'openai'
    ? OPENAI_DEV_MODELS[complexity]
    : ANTHROPIC_MODELS[complexity]
  const labelNames = opts.labels?.map((label) => label.toLowerCase()) ?? []
  const workstream: Workstream = labelNames.includes('frontend')
    ? 'frontend'
    : labelNames.includes('backend')
      ? 'backend'
      : labelNames.includes('fullstack')
        ? 'fullstack'
        : 'fullstack'
  console.log(`[Claude] model=${model} complexity=${complexity}`)

  const contextSection = opts.projectContext
    ? `## Project context\n${opts.projectContext}\n\n`
    : ''

  const workstreamGuidance = workstream === 'frontend'
    ? 'Focus on UI, layout, interaction, client-side state, and user-facing polish. Avoid backend changes unless the issue explicitly requires them.'
    : workstream === 'backend'
      ? 'Focus on APIs, data flow, business logic, persistence, and server-side behavior. Avoid unnecessary UI changes.'
      : 'Treat this as a fullstack issue. Keep the scope balanced across UI and backend changes.'

  const systemPrompt = `You are an expert ${opts.techStack || 'Next.js / TypeScript'} developer implementing a Linear issue.

${contextSection}Use the tools to explore the codebase and implement the task:
1. Prefer list_dir first to orient yourself before reading files
2. Call read_file only for files you truly need
3. Avoid reading generated files, lockfiles, binaries, or very large files unless absolutely necessary
4. If the issue needs a brand/product logo SVG, use search_logo and fetch_logo_svg with theSVG before hardcoding or redrawing assets
5. Call write_file for each file you want to change (full file content, not diffs)
6. Call done when finished — do NOT call done until all write_file calls are complete

Workstream: ${workstream}
${workstreamGuidance}

Be surgical: change only what's needed. If you cannot safely implement, call done with no prior write_file calls and explain in summary.`

  const userPrompt = `Implement this issue:\n\n**${opts.issueTitle}**\n\n${opts.issueDescription || '(no description)'}`

  const changes: DevResult['changes'] = []
  let summary = ''
  let prDescription = ''
  let iterations = 0
  const MAX_ITER = DEV_MAX_ITERATIONS[complexity]

  if (provider === 'openai') {
    const openAiTools = DEV_TOOLS.map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema,
      },
    }))

    const messages: Array<Record<string, any>> = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]

    while (iterations++ < MAX_ITER) {
      const response = await openAIChatCompletion({
        model,
        messages,
        tools: openAiTools,
        tool_choice: 'auto',
        max_completion_tokens: DEV_MAX_TOKENS[complexity],
      })

      const assistantMessage = response.choices?.[0]?.message
      if (!assistantMessage) break
      messages.push(assistantMessage)

      const toolCalls = assistantMessage.tool_calls ?? []
      if (toolCalls.length === 0) {
        break
      }

      for (const toolCall of toolCalls) {
        const input = JSON.parse(toolCall.function.arguments || '{}') as Record<string, string>
        let result = ''

        if (toolCall.function.name === 'read_file') {
          const file = await readFile(opts.repo, input.path, opts.token)
          result = file ? file.content : `File not found: ${input.path}`
        } else if (toolCall.function.name === 'list_dir') {
          const entries = await readDir(opts.repo, input.path, opts.token)
          result = entries.length > 0 ? entries.join('\n') : `Empty or not found: ${input.path}`
        } else if (toolCall.function.name === 'write_file') {
          const nextChange = { path: input.path, content: input.content, reason: input.reason }
          const existingIndex = changes.findIndex((change) => change.path === input.path)
          if (existingIndex >= 0) {
            changes[existingIndex] = nextChange
          } else {
            changes.push(nextChange)
          }
          result = `Staged: ${input.path}`
        } else if (toolCall.function.name === 'done') {
          summary = input.summary
          prDescription = input.prDescription
          return { changes, summary, prDescription }
        } else if (toolCall.function.name === 'search_logo') {
          const results = await searchLogos(input.query)
          result = results.length > 0
            ? JSON.stringify(results, null, 2)
            : `No logos found for query: ${input.query}`
        } else if (toolCall.function.name === 'fetch_logo_svg') {
          result = await fetchLogoSvg(input.slug, input.variant || 'default')
        }

        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: result,
        })
      }
    }

    return { changes, summary: summary || 'Implementation loop ended without done signal.', prDescription }
  }

  if (!anthropicClient) {
    throw new Error('Missing ANTHROPIC_API_KEY')
  }

  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userPrompt }]

  while (iterations++ < MAX_ITER) {
    const response = await anthropicClient.messages.create({
      model,
      max_tokens: DEV_MAX_TOKENS[complexity],
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
          const nextChange = { path: input.path, content: input.content, reason: input.reason }
          const existingIndex = changes.findIndex((change) => change.path === input.path)
          if (existingIndex >= 0) {
            changes[existingIndex] = nextChange
          } else {
            changes.push(nextChange)
          }
          result = `Staged: ${input.path}`
        }

        else if (block.name === 'done') {
          summary = input.summary
          prDescription = input.prDescription
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: 'Done acknowledged.' })
          messages.push({ role: 'user', content: toolResults })
          return { changes, summary, prDescription }
        }

        else if (block.name === 'search_logo') {
          console.log(`[Claude] search_logo: ${input.query}`)
          const results = await searchLogos(input.query)
          result = results.length > 0
            ? JSON.stringify(results, null, 2)
            : `No logos found for query: ${input.query}`
        }

        else if (block.name === 'fetch_logo_svg') {
          const variant = input.variant || 'default'
          console.log(`[Claude] fetch_logo_svg: ${input.slug}/${variant}`)
          result = await fetchLogoSvg(input.slug, variant)
        }

        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result })
      }

      messages.push({ role: 'user', content: toolResults })
    }
  }

  return { changes, summary: summary || 'Implementation loop ended without done signal.', prDescription }
}

// ─── PM Agent ────────────────────────────────────────────────────────────────

export interface RoadmapIssue {
  title: string
  description: string
  priority: 1|2|3|4
  estimate: number
  epic: string
  workstream: Workstream
}

export interface RoadmapSprint {
  name: string
  goal: string
  startWeek: number
  durationWeeks: number
  issues: RoadmapIssue[]
}

export interface RoadmapRelease {
  name: string
  description: string
  sprints: RoadmapSprint[]
}

export interface RoadmapPhase {
  name: string
  goal: string
  releases: RoadmapRelease[]
}

export interface Roadmap {
  projectName: string
  projectDescription: string
  phases: RoadmapPhase[]
  releases?: RoadmapRelease[]
}

const ISSUE_DESCRIPTION_FORMAT = `## Problem
<what is broken, missing, or still manual today>

## Solution
<proposed product or technical approach>

## Figma Design
- Link: <paste figma link here if available>

## Workstream
- frontend | backend | fullstack

## Acceptance Criteria
- <testable user-facing outcome>
- <testable system or data behavior>

## Dependencies
- <API, data, design, migration, or sequencing dependency if any>

## Ready for Dev
- [ ] Scope is clear
- [ ] API / data dependency is known
- [ ] Figma link added or explicitly not needed

## Notes
- <optional scope notes, constraints, or assumptions>`

export async function analyzePRD(prd: string): Promise<Roadmap> {
  const raw = await generateStructuredText({
    anthropicModel: 'claude-sonnet-4-5-20251001',
    openaiModel: process.env.RUNWAY_OPENAI_PLAN_MODEL || 'gpt-5-mini',
    maxTokens: 6000,
    userPrompt: `You are a senior PM. Analyze this PRD and return ONLY a JSON roadmap (no markdown).

PRD:
${prd}

JSON shape:
{"projectName":"string","projectDescription":"string","phases":[{"name":"Phase 1 — Foundation","goal":"string","releases":[{"name":"Release 1 — MVP","description":"string","sprints":[{"name":"Sprint 1","goal":"string","startWeek":0,"durationWeeks":2,"issues":[{"title":"string","description":"markdown issue body using the required template","priority":2,"estimate":3,"epic":"string"}]}]}]}]}
{"projectName":"string","projectDescription":"string","phases":[{"name":"Phase 1 — Foundation","goal":"string","releases":[{"name":"Release 1 — MVP","description":"string","sprints":[{"name":"Sprint 1","goal":"string","startWeek":0,"durationWeeks":2,"issues":[{"title":"string","description":"markdown issue body using the required template","priority":2,"estimate":3,"epic":"string","workstream":"frontend"}]}]}]}]}

Issue description template for every issue:
${ISSUE_DESCRIPTION_FORMAT}

Rules:
- split the roadmap into phases first, then releases, then sprints, then issues
- each phase should represent a meaningful product or technical milestone
- each release should be shippable
- max 8 issues/sprint
- priority 1-4 (1 = P0)
- estimate in story points
- assign every issue exactly one workstream: frontend, backend, or fullstack
- write issue descriptions in Vietnamese if the PRD is Vietnamese, otherwise match the PRD language
- convert vague "done criteria" into concrete "Acceptance Criteria"
- always include the "## Figma Design" section, even if no link exists yet`,
  })
  const cleaned = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
  return JSON.parse(cleaned) as Roadmap
}

// ─── Refine Agent ─────────────────────────────────────────────────────────────

export interface RefinedIssue {
  issueId: string
  description: string   // enriched markdown using the standard issue template
  estimate: number      // story points: 1/2/3/5/8
  complexity: 'simple' | 'normal' | 'complex'
  workstream: Workstream
  summary: string       // one line describing what was added
}

export interface ProductIssueDraft {
  title: string
  description: string
  priority: 1|2|3|4
  workstream: Workstream
  needsDesign: boolean
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

  const raw = await generateStructuredText({
    anthropicModel: 'claude-sonnet-4-5-20251001',
    openaiModel: process.env.RUNWAY_OPENAI_REFINE_MODEL || 'gpt-5-mini',
    maxTokens: 8000,
    userPrompt: `You are a senior PM and tech lead. Refine these Linear issues for a ${opts.techStack || 'Next.js'} project.

${contextSection}Repository top-level structure:
${dirListing.slice(0, 40).join('\n')}

For each issue produce:
1. Enriched description using this exact section structure:
${ISSUE_DESCRIPTION_FORMAT}
2. Story points: 1 (trivial <1h), 2 (small ~2h), 3 (medium ~half day), 5 (large ~1 day), 8 (very large >1 day)
3. Complexity: simple | normal | complex
4. Workstream: frontend | backend | fullstack

Issues to refine:
${issueList}

Return ONLY a JSON array (no markdown fences):
[{"issueId":"<exact issue id>","description":"<full markdown using the required template>","estimate":<number>,"complexity":"<simple|normal|complex>","workstream":"<frontend|backend|fullstack>","summary":"<one line>"}]

Important:
- keep "## Figma Design" even when there is no design yet; use "- Link: TBD"
- keep "## Workstream" and choose exactly one of frontend, backend, fullstack
- rewrite "Done criteria" into "## Acceptance Criteria"
- make acceptance criteria concrete and testable
- add a useful "## Dependencies" section when something must land first
- use the "## Ready for Dev" checklist to surface missing inputs, not to hide uncertainty
- preserve any existing useful scope details from the original issue`,
  })
  const cleaned = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
  return JSON.parse(cleaned) as RefinedIssue[]
}

export async function analyzeFeatureRequest(opts: {
  brief: string
  figmaUrl?: string
  languageHint?: string
}): Promise<{
  summary: string
  shouldBuildNow: boolean
  issues: ProductIssueDraft[]
}> {
  const figmaSection = opts.figmaUrl
    ? `Figma source of truth:\n${opts.figmaUrl}\n\nUse the Figma link as the primary design reference. Do not ask for design work if the brief is already covered by Figma.\n`
    : 'No Figma link was provided.\n'

  const raw = await generateStructuredText({
    anthropicModel: 'claude-haiku-4-5-20251001',
    openaiModel: process.env.RUNWAY_OPENAI_PRODUCT_MODEL || 'gpt-5-mini',
    maxTokens: 2500,
    userPrompt: `You are a product-minded PM. Analyze this feature request and produce a small set of draft Linear issues for human review before any coding happens.

${figmaSection}
Feature request:
${opts.brief}

Issue description template for every issue:
${ISSUE_DESCRIPTION_FORMAT}

Return ONLY JSON:
{"summary":"string","shouldBuildNow":false,"issues":[{"title":"string","description":"string","priority":2,"workstream":"frontend","needsDesign":false}]}

Rules:
- keep issue count small, usually 1-3 issues
- assign every issue exactly one workstream: frontend, backend, or fullstack
- if Figma is present, include it in the "## Figma Design" section and prefer "needsDesign": false
- if Figma is missing and the feature clearly needs UI exploration, set "needsDesign": true
- descriptions should be implementation-ready enough for review, but this step must NOT start coding
- default shouldBuildNow to false because a human will review the issues first
- write in Vietnamese if the request is Vietnamese, otherwise match the request language`,
  })
  const cleaned = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
  return JSON.parse(cleaned) as {
    summary: string
    shouldBuildNow: boolean
    issues: ProductIssueDraft[]
  }
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

  const raw = await generateStructuredText({
    anthropicModel: 'claude-sonnet-4-5-20251001',
    openaiModel: process.env.RUNWAY_OPENAI_REPORT_MODEL || 'gpt-5-mini',
    maxTokens: 2000,
    userPrompt: `Generate a sprint retrospective for ${opts.sprintName}.

Completed (${opts.doneIssues.length} issues, ${velocity}pts):
${doneText}

Not completed (${opts.notDoneIssues.length} issues, ${remainingPts}pts):
${notDoneText}

Return ONLY JSON (no markdown fences):
{"summary":"2-3 sentences","recommendations":["action 1","action 2","action 3"],"carryOvers":[{"issueId":"<exact id from not-done list>","reason":"why this should be first next sprint"}]}

carryOvers = high-priority incomplete issues that must be done first next sprint. issueId must match the id field in the not-done list above.`,
  })
  const cleaned = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
  const parsed = JSON.parse(cleaned) as {
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
  const raw = await generateStructuredText({
    anthropicModel: 'claude-sonnet-4-5-20251001',
    openaiModel: process.env.RUNWAY_OPENAI_DOC_MODEL || 'gpt-5-mini',
    maxTokens: 4096,
    userPrompt: `Write a ${opts.docType === 'brief' ? 'Project Brief' : 'PRD'} from this context. Return ONLY JSON: {"title":"string","markdown":"string"}

Context:
${opts.context}`,
  })
  const cleaned = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
  const parsed = JSON.parse(cleaned) as { title: string; markdown: string }
  return { title: parsed.title, docType: opts.docType, markdown: parsed.markdown }
}
