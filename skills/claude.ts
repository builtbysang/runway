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

// ─── Doc Agent ────────────────────────────────────────────────────────────────

export type DocType = 'brief' | 'prd'

export interface DocumentDraft {
  title: string        // used as the Notion page title
  docType: DocType
  markdown: string     // full document in markdown, ready for Notion conversion
}

export async function draftDocument(opts: {
  context: string   // free-form: idea, notes, conversation, bullet points — anything
  docType: DocType
}): Promise<DocumentDraft> {
  const isBrief = opts.docType === 'brief'

  const prompt = isBrief
    ? `You are a senior Product Manager writing a Project Brief for a new initiative.

The brief must be a 1–2 page structured document that creates fast alignment across
stakeholders before any design or engineering work begins.

## Input context
${opts.context}

## Output rules
- Return ONLY a JSON object, no markdown code fences
- JSON shape: { "title": "string", "markdown": "string" }
- title: short project name (5 words max)
- markdown: the full Project Brief in well-structured markdown

## Project Brief structure (use exactly these sections)
# [Project Name]

**Status:** Draft
**Owner:** [infer from context or leave blank]
**Date:** ${new Date().toISOString().slice(0, 10)}

---

## The Problem
[1–3 sentences. Specific, evidence-backed if possible.]

## Why Now
[What changed? Why solve this and not something else?]

## Proposed Solution
[What are we building — high level. What we're explicitly NOT doing.]

## Target Users
[Who specifically? Context + emotional state.]

## Success Metrics
[1–3 measurable signals. Behavior change preferred over revenue.]

## Scope
### In Scope
- [Deliverable]

### Out of Scope
- [Explicit exclusion — prevents scope creep]

## Constraints & Dependencies
- **Timeline:**
- **Team:**
- **Dependencies:**
- **Risks:**

## Open Questions
- [Unresolved question before committing]

## Approvals
| Role | Name | Status | Date |
|------|------|--------|------|
| Product | | ⏳ Pending | |
| Design | | ⏳ Pending | |
| Engineering | | ⏳ Pending | |`
    : `You are a senior Product Manager writing a full PRD (Product Requirements Document).

The PRD must give designers and engineers enough context to start work independently.

## Input context
${opts.context}

## Output rules
- Return ONLY a JSON object, no markdown code fences
- JSON shape: { "title": "string", "markdown": "string" }
- title: feature or product name (5 words max)
- markdown: the full PRD in well-structured markdown

## PRD structure (use exactly these sections)
# [Feature Name] — PRD

**Status:** Draft
**PM:** [infer or blank]
**Designer:** [infer or blank]
**Lead Engineer:** [infer or blank]
**Created:** ${new Date().toISOString().slice(0, 10)}
**Last Updated:** ${new Date().toISOString().slice(0, 10)}
**Target Launch:** [infer from context or TBD]

---

## TL;DR
[3–5 sentences. What, why, success. Write this as if it's all someone will read.]

---

## 1. Background & Problem

### Context
[Situation, what changed, why now.]

### Problem Statement
[Precise: "When [user] tries to [task], they [struggle] because [cause]. This results in [outcome]."]

### Evidence
[Data, research, feedback, or support signals that prove the problem is real.]

---

## 2. Goals & Non-Goals

### Goals
- [User outcome]
- [Business outcome]

### Non-Goals
- [Explicitly out of scope]

### Success Metrics
| Metric | Baseline | Target | How measured |
|--------|----------|--------|--------------|
| [Primary] | | | |
| [Secondary] | | | |

---

## 3. User Stories & Requirements

### Target Users
[Segment + context + emotional state]

### User Stories

**Happy Path**
As a [user], I want to [action] so that [outcome].

Acceptance Criteria:
- [ ] [Testable condition]
- [ ] [Testable condition]
- [ ] [Edge case or error condition]

**Error / Edge Case**
As a [user], when [condition], I want to [action] so that [outcome].

Acceptance Criteria:
- [ ] [Condition]

### Functional Requirements
| ID | Requirement | Priority |
|----|-------------|----------|
| F-01 | [P0 requirement] | P0 |
| F-02 | [P1 requirement] | P1 |

### Non-Functional Requirements
- **Performance:**
- **Accessibility:** WCAG AA minimum
- **Security:**

---

## 4. Design

### Key Flows
[Main user journey. Link to Figma if available.]

### States to Design
- [ ] Empty state
- [ ] Loading state
- [ ] Error state (recoverable)
- [ ] Success / confirmation state
- [ ] Edge cases (0 items, long text, missing data)

---

## 5. Technical Considerations
[API changes, data model impacts, performance concerns, third-party dependencies.]

---

## 6. Launch Plan

### Rollout
- [ ] Feature flag / gradual rollout
- [ ] Full rollout date:

### Comms
- [ ] Changelog entry
- [ ] Help docs update

---

## 7. Open Questions
| Question | Owner | Status |
|----------|-------|--------|
| [Question] | | ⏳ Open |

---

## 8. Appendix
[Supporting research, competitive analysis, analytics screenshots.]`

  const response = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 8192,
    thinking: { type: 'adaptive' },
    messages: [{ role: 'user', content: prompt }],
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
