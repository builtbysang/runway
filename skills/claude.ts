/**
 * Runway — Claude API skill
 * PM mode: analyze PRD → generate roadmap JSON
 * Dev mode: analyze issue + files → generate code changes JSON
 */
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ─── PM Agent ─────────────────────────────────────────────────────────────────

export interface Sprint {
  name: string
  goal: string
  startWeek: number  // weeks from now
  durationWeeks: number
  issues: {
    title: string
    description: string
    priority: 1 | 2 | 3 | 4  // 1=Urgent 2=High 3=Medium 4=Low
    estimate: number           // story points
    epic: string
  }[]
}

export interface Roadmap {
  projectName: string
  projectDescription: string
  releases: {
    name: string       // "Release 1 — MVP"
    description: string
    sprints: Sprint[]
  }[]
}

export async function analyzePRD(prd: string): Promise<Roadmap> {
  const prompt = `You are a senior Product Manager. Analyze this PRD and produce a full release roadmap.

PRD:
${prd}

Return ONLY a JSON object (no markdown) with this shape:
{
  "projectName": "string",
  "projectDescription": "string",
  "releases": [
    {
      "name": "Release 1 — MVP",
      "description": "string",
      "sprints": [
        {
          "name": "Sprint 1 — Foundation",
          "goal": "string",
          "startWeek": 0,
          "durationWeeks": 2,
          "issues": [
            {
              "title": "string",
              "description": "string — detailed acceptance criteria",
              "priority": 1,
              "estimate": 3,
              "epic": "string — epic/feature group name"
            }
          ]
        }
      ]
    }
  ]
}

Rules:
- Release 1 = MVP (must-have only)
- Release 2 = Growth features
- Release 3+ = Optimization/scale (if needed)
- Each sprint = 2 weeks, max 8 issues
- Priority: 1=Urgent(P0) 2=High(P1) 3=Medium(P2) 4=Low(backlog)
- Estimate in story points: 1=XS 2=S 3=M 5=L 8=XL`

  const response = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 8192,
    thinking: { type: 'adaptive' },
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content.find((b) => b.type === 'text')
  if (!text || text.type !== 'text') throw new Error('No response from Claude')

  const raw = text.text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
  return JSON.parse(raw) as Roadmap
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
}): Promise<DevResult> {
  const fileContext = opts.files
    .map((f) => `### ${f.path}\n\`\`\`\n${f.content}\n\`\`\``)
    .join('\n\n')

  const prompt = `You are an expert ${opts.techStack || 'Next.js / TypeScript'} developer.

## Task
**Title:** ${opts.issueTitle}

**Description:**
${opts.issueDescription || '(no description)'}

## Relevant files
${fileContext || '(no files provided)'}

Return ONLY a JSON object (no markdown) with this shape:
{
  "changes": [
    {
      "path": "relative/path/to/file.tsx",
      "content": "FULL file content after changes",
      "reason": "one sentence explaining this change"
    }
  ],
  "summary": "one paragraph of what was implemented",
  "prDescription": "## What\\n...\\n## Why\\n...\\n## How to test\\n..."
}

Rules:
- Only change files directly needed for this task
- Return complete file content, never partial
- If you cannot safely implement, return changes: [] and explain in summary`

  const response = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 8192,
    thinking: { type: 'adaptive' },
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content.find((b) => b.type === 'text')
  if (!text || text.type !== 'text') throw new Error('No response from Claude')

  const raw = text.text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
  return JSON.parse(raw) as DevResult
}
