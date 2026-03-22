/**
 * POST /api/refine
 * Refine backlog issues: Claude enriches each with acceptance criteria,
 * a story-point estimate, and a complexity label, then updates Linear in-place.
 *
 * Body:
 *   projectKey   — key from projects.json
 *   issueIds?    — explicit list of issue IDs/identifiers to refine
 *   stateName?   — filter by state name, default "Backlog"
 *   limit?       — max issues to process at once, default 10
 */
import { NextRequest, NextResponse } from 'next/server'
import { refineIssues } from '@/skills/claude'
import { readProjectContext } from '@/skills/notion'
import {
  listIssues,
  updateIssueDetails,
  addLabelToIssue,
  findOrCreateLabel,
  addComment,
} from '@/skills/linear'
import projectsConfig from '@/projects.json'

type ProjectKey = keyof typeof projectsConfig

// Label colors by complexity
const COMPLEXITY_COLORS: Record<string, string> = {
  simple:  '#22c55e',
  normal:  '#f59e0b',
  complex: '#ef4444',
}

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    projectKey: ProjectKey
    issueIds?: string[]
    stateName?: string
    limit?: number
  }

  const config = projectsConfig[body.projectKey]
  if (!config) {
    return NextResponse.json({ error: `Unknown projectKey: ${body.projectKey}` }, { status: 400 })
  }

  // Fetch issues
  let issues
  if (body.issueIds?.length) {
    const all = await listIssues({ teamId: config.linearTeamId })
    issues = all.filter(i =>
      body.issueIds!.includes(i.id) || body.issueIds!.includes(i.identifier)
    )
  } else {
    issues = await listIssues({
      teamId: config.linearTeamId,
      stateName: body.stateName ?? 'Backlog',
    })
  }

  const limit = body.limit ?? 10
  issues = issues.slice(0, limit)

  if (issues.length === 0) {
    return NextResponse.json({ ok: true, message: 'No issues found', refined: 0 })
  }

  // Fetch Notion context (optional)
  const projectContext = config.notionContextPageId
    ? await readProjectContext(config.notionContextPageId).catch(() => null)
    : null

  console.log(`[Refine] Refining ${issues.length} issues for ${body.projectKey}…`)

  const refined = await refineIssues({
    issues: issues.map(i => ({
      id: i.id,
      identifier: i.identifier,
      title: i.title,
      description: i.description,
    })),
    repo: config.githubRepo,
    token: process.env.GITHUB_TOKEN || '',
    techStack: config.techStack,
    projectContext: projectContext ?? undefined,
  })

  // Apply updates to Linear
  const results: { identifier: string; estimate: number; complexity: string }[] = []

  for (const r of refined) {
    const issue = issues.find(i => i.id === r.issueId)
    if (!issue) continue

    try {
      // 1. Update description + estimate
      await updateIssueDetails(r.issueId, {
        description: r.description,
        estimate: r.estimate,
      })

      // 2. Add complexity label
      const labelId = await findOrCreateLabel(
        config.linearTeamId,
        r.complexity,
        COMPLEXITY_COLORS[r.complexity]
      )
      await addLabelToIssue(r.issueId, labelId)

      // 3. Comment with refinement summary
      await addComment(
        r.issueId,
        `🛫 **Runway refined this issue**\n\n${r.summary}\n\n*Estimate: ${r.estimate}pts · Complexity: ${r.complexity}*`
      )

      results.push({ identifier: issue.identifier, estimate: r.estimate, complexity: r.complexity })
      console.log(`[Refine] ✓ ${issue.identifier} → ${r.estimate}pts (${r.complexity})`)
    } catch (err) {
      console.error(`[Refine] Failed ${issue.identifier}:`, err)
    }
  }

  return NextResponse.json({
    ok: true,
    refined: results.length,
    issues: results,
  })
}
