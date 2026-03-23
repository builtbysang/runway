/**
 * Runway — local CLI LLM skill
 *
 * Runway now uses local authenticated agent CLIs instead of direct LLM APIs:
 * - Codex CLI
 * - Claude Code CLI
 *
 * PM/Product flows use one-shot structured generation.
 * Dev flow runs the selected CLI inside a temporary repo workspace, then
 * captures the resulting file diff to open a PR through GitHub.
 */
import { spawn, spawnSync } from 'node:child_process'
import { mkdtemp, readFile as readLocalFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { readDir } from './github'

// ─── Model selection ──────────────────────────────────────────────────────────

type Complexity = 'simple' | 'normal' | 'complex'
export type Workstream = 'frontend' | 'backend' | 'fullstack'
type LlmProvider = 'codex-cli' | 'claude-cli'

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

const CODEX_DEV_MODELS: Record<Complexity, string> = {
  simple: process.env.RUNWAY_CODEX_DEV_MODEL_SIMPLE || 'gpt-5.1-codex-mini',
  normal: process.env.RUNWAY_CODEX_DEV_MODEL_NORMAL || 'gpt-5.1-codex-mini',
  complex: process.env.RUNWAY_CODEX_DEV_MODEL_COMPLEX || 'gpt-5.1-codex',
}

const CLAUDE_DEV_MODELS: Record<Complexity, string> = {
  simple: process.env.RUNWAY_CLAUDE_DEV_MODEL_SIMPLE || 'sonnet',
  normal: process.env.RUNWAY_CLAUDE_DEV_MODEL_NORMAL || 'sonnet',
  complex: process.env.RUNWAY_CLAUDE_DEV_MODEL_COMPLEX || 'opus',
}

const DEFAULT_READ_ONLY_SCHEMA = {
  type: 'object',
  additionalProperties: true,
} as const

function commandExists(command: string): boolean {
  const result = spawnSync(command, ['--version'], { stdio: 'ignore' })
  return result.status === 0
}

function getLlmProvider(): LlmProvider {
  const configured = process.env.RUNWAY_LLM_PROVIDER?.toLowerCase()
  if (configured === 'codex' || configured === 'codex-cli' || configured === 'openai') {
    return 'codex-cli'
  }
  if (configured === 'claude' || configured === 'claude-cli' || configured === 'anthropic') {
    return 'claude-cli'
  }
  if (commandExists('codex')) return 'codex-cli'
  return 'claude-cli'
}

export function hasLlmCredentials(): boolean {
  const provider = getLlmProvider()
  return provider === 'codex-cli'
    ? commandExists('codex')
    : commandExists('claude')
}

export function getLlmBackendStatus() {
  return {
    provider: getLlmProvider(),
    hasCodexCli: commandExists('codex'),
    hasClaudeCli: commandExists('claude'),
  }
}

async function runProcess(command: string, args: string[], opts: {
  cwd?: string
  input?: string
} = {}): Promise<{ stdout: string; stderr: string }> {
  return await new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: opts.cwd,
      stdio: 'pipe',
      env: process.env,
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolvePromise({ stdout, stderr })
        return
      }
      reject(new Error(`${command} exited with code ${code}\n${stderr || stdout}`))
    })

    if (opts.input) {
      child.stdin.write(opts.input)
    }
    child.stdin.end()
  })
}

function stripCodeFences(text: string): string {
  return text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
}

async function runStructuredPrompt(opts: {
  systemPrompt?: string
  userPrompt: string
  schema?: object
  cwd?: string
  mode?: 'read-only' | 'workspace-write'
  complexity?: Complexity
}): Promise<string> {
  const provider = getLlmProvider()
  const prompt = opts.systemPrompt
    ? `${opts.systemPrompt}\n\n${opts.userPrompt}`
    : opts.userPrompt
  const schema = opts.schema || DEFAULT_READ_ONLY_SCHEMA

  if (provider === 'codex-cli') {
    const tempDir = await mkdtemp(join(tmpdir(), 'runway-schema-'))
    const schemaPath = join(tempDir, 'schema.json')
    const outputPath = join(tempDir, 'output.json')

    try {
      await writeFile(schemaPath, `${JSON.stringify(schema, null, 2)}\n`)
      const args = [
        'exec',
        '--skip-git-repo-check',
        opts.mode === 'workspace-write'
          ? '--dangerously-bypass-approvals-and-sandbox'
          : '--sandbox',
      ]
      if (opts.mode !== 'workspace-write') {
        args.push('read-only')
      }
      if (opts.cwd) {
        args.push('-C', opts.cwd)
      }
      args.push('--output-schema', schemaPath, '--output-last-message', outputPath)

      const model = opts.mode === 'workspace-write'
        ? CODEX_DEV_MODELS[opts.complexity || 'normal']
        : process.env.RUNWAY_CODEX_TEXT_MODEL
      if (model) {
        args.push('--model', model)
      }

      args.push('-')
      await runProcess('codex', args, { cwd: opts.cwd, input: prompt })
      return stripCodeFences(await readLocalFile(outputPath, 'utf-8'))
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  }

  const args = [
    '-p',
    '--output-format',
    'text',
    '--permission-mode',
    opts.mode === 'workspace-write' ? 'bypassPermissions' : 'default',
    '--json-schema',
    JSON.stringify(schema),
    '--no-session-persistence',
  ]
  const model = opts.mode === 'workspace-write'
    ? CLAUDE_DEV_MODELS[opts.complexity || 'normal']
    : process.env.RUNWAY_CLAUDE_TEXT_MODEL
  if (model) {
    args.push('--model', model)
  }
  if (opts.systemPrompt) {
    args.push('--system-prompt', opts.systemPrompt)
  }
  args.push(prompt)
  const { stdout } = await runProcess('claude', args, { cwd: opts.cwd })
  return stripCodeFences(stdout)
}

async function runTextPrompt(opts: {
  systemPrompt?: string
  userPrompt: string
  cwd?: string
  mode?: 'read-only' | 'workspace-write'
  complexity?: Complexity
}): Promise<string> {
  const provider = getLlmProvider()
  const prompt = opts.systemPrompt
    ? `${opts.systemPrompt}\n\n${opts.userPrompt}`
    : opts.userPrompt

  if (provider === 'codex-cli') {
    const tempDir = await mkdtemp(join(tmpdir(), 'runway-output-'))
    const outputPath = join(tempDir, 'output.txt')

    try {
      const args = [
        'exec',
        '--skip-git-repo-check',
        opts.mode === 'workspace-write'
          ? '--dangerously-bypass-approvals-and-sandbox'
          : '--sandbox',
      ]
      if (opts.mode !== 'workspace-write') {
        args.push('read-only')
      }
      if (opts.cwd) {
        args.push('-C', opts.cwd)
      }
      args.push('--output-last-message', outputPath)

      const model = opts.mode === 'workspace-write'
        ? CODEX_DEV_MODELS[opts.complexity || 'normal']
        : process.env.RUNWAY_CODEX_TEXT_MODEL
      if (model) {
        args.push('--model', model)
      }

      args.push('-')
      await runProcess('codex', args, { cwd: opts.cwd, input: prompt })
      return stripCodeFences(await readLocalFile(outputPath, 'utf-8'))
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  }

  const args = [
    '-p',
    '--output-format',
    'text',
    '--permission-mode',
    opts.mode === 'workspace-write' ? 'bypassPermissions' : 'default',
    '--no-session-persistence',
  ]
  const model = opts.mode === 'workspace-write'
    ? CLAUDE_DEV_MODELS[opts.complexity || 'normal']
    : process.env.RUNWAY_CLAUDE_TEXT_MODEL
  if (model) {
    args.push('--model', model)
  }
  if (opts.systemPrompt) {
    args.push('--system-prompt', opts.systemPrompt)
  }
  args.push(prompt)
  const { stdout } = await runProcess('claude', args, { cwd: opts.cwd })
  return stripCodeFences(stdout)
}

async function generateStructuredText(opts: {
  schema: object
  systemPrompt?: string
  userPrompt: string
}): Promise<string> {
  return await runStructuredPrompt({
    systemPrompt: opts.systemPrompt,
    userPrompt: opts.userPrompt,
    schema: opts.schema,
    mode: 'read-only',
  })
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
  localRepoPath?: string
  techStack?: string
  projectContext?: string
  labels?: string[]
}): Promise<DevResult> {
  const provider = getLlmProvider()
  const complexity = detectComplexity(opts.issueTitle, opts.issueDescription, opts.labels)
  const labelNames = opts.labels?.map((label) => label.toLowerCase()) ?? []
  const workstream: Workstream = labelNames.includes('frontend')
    ? 'frontend'
    : labelNames.includes('backend')
      ? 'backend'
      : labelNames.includes('fullstack')
        ? 'fullstack'
        : 'fullstack'
  const model = provider === 'codex-cli'
    ? CODEX_DEV_MODELS[complexity]
    : CLAUDE_DEV_MODELS[complexity]
  console.log(`[Runway] provider=${provider} model=${model} complexity=${complexity}`)

  const contextSection = opts.projectContext
    ? `## Project context\n${opts.projectContext}\n\n`
    : ''

  const workstreamGuidance = workstream === 'frontend'
    ? 'Focus on UI, layout, interaction, client-side state, and user-facing polish. Avoid backend changes unless the issue explicitly requires them.'
    : workstream === 'backend'
      ? 'Focus on APIs, data flow, business logic, persistence, and server-side behavior. Avoid unnecessary UI changes.'
      : 'Treat this as a fullstack issue. Keep the scope balanced across UI and backend changes.'

  const tempRoot = await mkdtemp(join(tmpdir(), 'runway-dev-'))
  const workspaceDir = join(tempRoot, 'repo')
  const repoSource = opts.localRepoPath
    ? resolve(opts.localRepoPath)
    : opts.token
      ? `https://x-access-token:${opts.token}@github.com/${opts.repo}.git`
      : `https://github.com/${opts.repo}.git`

  try {
    await runProcess('git', ['clone', '--depth', '1', repoSource, workspaceDir])

    const repoRootListing = await readDir(opts.repo, '', opts.token).catch(() => [])
    const systemPrompt = `You are an expert ${opts.techStack || 'Next.js / TypeScript'} developer implementing a Linear issue inside a local git workspace.

${contextSection}Workstream: ${workstream}
${workstreamGuidance}

Rules:
- make the smallest safe change set that fully solves the issue
- do not delete files
- do not rename files
- do not commit, push, or open a PR yourself
- if the task needs a brand or product logo, fetch the SVG from theSVG instead of redrawing it
- keep changes production-minded and consistent with the existing codebase
- before you finish, verify the actual modified files in the workspace using git diff or equivalent
- if there are no file changes, say that clearly instead of pretending the task was implemented
- when finished, respond with JSON only`

    const userPrompt = `Repository top level:
${repoRootListing.slice(0, 50).join('\n') || '(unable to read repo listing via GitHub API)'}

Implement this issue:

Title: ${opts.issueTitle}

Description:
${opts.issueDescription || '(no description)'}

Return JSON with:
- summary: one paragraph
- prDescription: markdown with sections ## What, ## Why, ## How to test`

    await runTextPrompt({
      systemPrompt,
      userPrompt,
      cwd: workspaceDir,
      mode: 'workspace-write',
      complexity,
    })

    const { stdout: unsupportedChanges } = await runProcess(
      'git',
      ['diff', '--name-status', '--diff-filter=DR'],
      { cwd: workspaceDir },
    )
    if (unsupportedChanges.trim()) {
      throw new Error(
        `Dev Agent produced unsupported file deletions or renames:\n${unsupportedChanges.trim()}`,
      )
    }

    const { stdout: changedPathsOutput } = await runProcess(
      'git',
      ['diff', '--name-only', '--diff-filter=ACM'],
      { cwd: workspaceDir },
    )
    const changedPaths = changedPathsOutput
      .split('\n')
      .map((entry) => entry.trim())
      .filter(Boolean)

    if (changedPaths.length === 0) {
      return {
        changes: [],
        summary: 'Local CLI run completed, but no file changes were detected in the workspace.',
        prDescription: '## What\n- no file changes were produced\n\n## Why\n- the local CLI finished without modifying the workspace\n\n## How to test\n- inspect the Runway logs and rerun with a narrower issue or a different provider if needed',
      }
    }

    const raw = await runStructuredPrompt({
      cwd: workspaceDir,
      mode: 'read-only',
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          summary: { type: 'string' },
          prDescription: { type: 'string' },
        },
        required: ['summary', 'prDescription'],
      },
      userPrompt: `You are summarizing an already completed implementation.

Issue title: ${opts.issueTitle}

Issue description:
${opts.issueDescription || '(no description)'}

Changed files:
${changedPaths.map((path) => `- ${path}`).join('\n')}

Return JSON with:
- summary: one paragraph
- prDescription: markdown with sections ## What, ## Why, ## How to test`,
    })

    const parsed = JSON.parse(stripCodeFences(raw)) as {
      summary: string
      prDescription: string
    }

    const changes = await Promise.all(
      changedPaths.map(async (path) => ({
        path,
        content: await readLocalFile(join(workspaceDir, path), 'utf-8'),
        reason: `Updated by ${provider} for ${opts.issueTitle}`,
      })),
    )

    return {
      changes,
      summary: parsed.summary,
      prDescription: parsed.prDescription,
    }
  } finally {
    await rm(tempRoot, { recursive: true, force: true })
  }
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
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        projectName: { type: 'string' },
        projectDescription: { type: 'string' },
        phases: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              name: { type: 'string' },
              goal: { type: 'string' },
              releases: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    name: { type: 'string' },
                    description: { type: 'string' },
                    sprints: {
                      type: 'array',
                      items: {
                        type: 'object',
                        additionalProperties: false,
                        properties: {
                          name: { type: 'string' },
                          goal: { type: 'string' },
                          startWeek: { type: 'number' },
                          durationWeeks: { type: 'number' },
                          issues: {
                            type: 'array',
                            items: {
                              type: 'object',
                              additionalProperties: false,
                              properties: {
                                title: { type: 'string' },
                                description: { type: 'string' },
                                priority: { type: 'number' },
                                estimate: { type: 'number' },
                                epic: { type: 'string' },
                                workstream: { type: 'string', enum: ['frontend', 'backend', 'fullstack'] },
                              },
                              required: ['title', 'description', 'priority', 'estimate', 'epic', 'workstream'],
                            },
                          },
                        },
                        required: ['name', 'goal', 'startWeek', 'durationWeeks', 'issues'],
                      },
                    },
                  },
                  required: ['name', 'description', 'sprints'],
                },
              },
            },
            required: ['name', 'goal', 'releases'],
          },
        },
      },
      required: ['projectName', 'projectDescription', 'phases'],
    },
    userPrompt: `You are a senior PM. Analyze this PRD and return ONLY a JSON roadmap (no markdown).

PRD:
${prd}

JSON shape:
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
    schema: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          issueId: { type: 'string' },
          description: { type: 'string' },
          estimate: { type: 'number' },
          complexity: { type: 'string', enum: ['simple', 'normal', 'complex'] },
          workstream: { type: 'string', enum: ['frontend', 'backend', 'fullstack'] },
          summary: { type: 'string' },
        },
        required: ['issueId', 'description', 'estimate', 'complexity', 'workstream', 'summary'],
      },
    },
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
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        summary: { type: 'string' },
        shouldBuildNow: { type: 'boolean' },
        issues: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              title: { type: 'string' },
              description: { type: 'string' },
              priority: { type: 'number' },
              workstream: { type: 'string', enum: ['frontend', 'backend', 'fullstack'] },
              needsDesign: { type: 'boolean' },
            },
            required: ['title', 'description', 'priority', 'workstream', 'needsDesign'],
          },
        },
      },
      required: ['summary', 'shouldBuildNow', 'issues'],
    },
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
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        summary: { type: 'string' },
        recommendations: { type: 'array', items: { type: 'string' } },
        carryOvers: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              issueId: { type: 'string' },
              reason: { type: 'string' },
            },
            required: ['issueId', 'reason'],
          },
        },
      },
      required: ['summary', 'recommendations', 'carryOvers'],
    },
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

export interface SteeringDocsDraft {
  product: string
  structure: string
  tech: string
  uxRules: string
  visualRules: string
  designSystem: string
}

export async function draftDocument(opts: { context: string; docType: DocType }): Promise<DocumentDraft> {
  const raw = await generateStructuredText({
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        title: { type: 'string' },
        markdown: { type: 'string' },
      },
      required: ['title', 'markdown'],
    },
    userPrompt: `Write a ${opts.docType === 'brief' ? 'Project Brief' : 'PRD'} from this context. Return ONLY JSON: {"title":"string","markdown":"string"}

Context:
${opts.context}`,
  })
  const cleaned = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
  const parsed = JSON.parse(cleaned) as { title: string; markdown: string }
  return { title: parsed.title, docType: opts.docType, markdown: parsed.markdown }
}

export async function draftSteeringDocs(opts: {
  context: string
  techStack?: string
  projectContext?: string
}): Promise<SteeringDocsDraft> {
  const contextSection = opts.projectContext
    ? `Existing project context:\n${opts.projectContext}\n\n`
    : ''

  const raw = await generateStructuredText({
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        product: { type: 'string' },
        structure: { type: 'string' },
        tech: { type: 'string' },
        uxRules: { type: 'string' },
        visualRules: { type: 'string' },
        designSystem: { type: 'string' },
      },
      required: ['product', 'structure', 'tech', 'uxRules', 'visualRules', 'designSystem'],
    },
    userPrompt: `Create six steering markdown documents for an engineering project.

${contextSection}Source context:
${opts.context}

Tech stack:
${opts.techStack || 'Unknown'}

Return JSON with:
- product: markdown for product direction and UX intent
- structure: markdown for repo/module boundaries and implementation structure
- tech: markdown for stack, architecture rules, constraints, and engineering conventions
- uxRules: markdown for 02-ux-rules.md
- visualRules: markdown for 03-visual-rules.md
- designSystem: markdown for 04-design-system.md

Requirements:
- write concise, high-signal markdown that agents can read quickly
- optimize for future PM Agent and Dev Agent context loading
- avoid generic filler
- if the source is Vietnamese, write in Vietnamese
- each document should be practical and opinionated

Document guidance:
- product.md should cover problem framing, target users, goals, non-goals, UX principles, success signals
- structure.md should cover domain boundaries, major modules, where new code should live, file/folder conventions, integration seams
- tech.md should cover stack, architectural constraints, coding patterns, data/API rules, testing expectations, deployment/runtime assumptions
- 02-ux-rules.md should cover UX principles, primary flows, hierarchy, writing guidance, and interaction behavior
- 03-visual-rules.md should cover visual style, color direction, mood, and art direction
- 04-design-system.md should cover tokens, components, patterns, states, and layout system`,
  })

  return JSON.parse(stripCodeFences(raw)) as SteeringDocsDraft
}
