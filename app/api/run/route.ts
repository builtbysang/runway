/**
 * POST /api/run
 * Batch-run the Dev Agent on Linear issues sequentially.
 * User can trigger and check back later — Runway posts progress to each issue.
 *
 * Body:
 *   projectKey  — key from projects.json (e.g. "wealth-next")
 *   cycleId?    — Linear cycle/sprint ID (optional)
 *   stateName?  — filter by state name, default "Todo"
 *   issueIds?   — explicit list of issue IDs (overrides cycle/state filter)
 */
import { NextRequest, NextResponse } from 'next/server'
import { runDevAgent } from '@/agents/dev-agent'
import { listIssues } from '@/skills/linear'
import projectsConfig from '@/projects.json'

type ProjectKey = keyof typeof projectsConfig

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    projectKey: ProjectKey
    cycleId?: string
    stateName?: string
    issueIds?: string[]
  }

  const config = projectsConfig[body.projectKey]
  if (!config) {
    return NextResponse.json({ error: `Unknown projectKey: ${body.projectKey}` }, { status: 400 })
  }

  let issues
  if (body.issueIds?.length) {
    // Fetch specific issues by ID
    const all = await listIssues({ teamId: config.linearTeamId })
    issues = all.filter((i) => body.issueIds!.includes(i.id) || body.issueIds!.includes(i.identifier))
  } else {
    issues = await listIssues({
      teamId: config.linearTeamId,
      cycleId: body.cycleId,
      stateName: body.stateName ?? 'Todo',
    })
  }

  if (issues.length === 0) {
    return NextResponse.json({ ok: true, message: 'No issues found matching the filter', ran: 0 })
  }

  console.log(`[run] Starting batch: ${issues.length} issues for ${body.projectKey}`)

  // Respond immediately — run sequentially in background
  const runBatch = async () => {
    for (const issue of issues) {
      console.log(`[run] Processing ${issue.identifier}: ${issue.title}`)
      try {
        await runDevAgent({
          id: issue.id,
          identifier: issue.identifier,
          title: issue.title,
          description: issue.description,
          teamId: issue.teamId,
        })
      } catch (err) {
        console.error(`[run] Failed ${issue.identifier}:`, err)
      }
    }
    console.log(`[run] Batch complete: ${issues.length} issues processed`)
  }

  runBatch().catch((err) => console.error('[run] Batch error:', err))

  return NextResponse.json({
    ok: true,
    started: issues.length,
    issues: issues.map((i) => ({ id: i.identifier, title: i.title })),
    message: `Running ${issues.length} issues sequentially. Check Linear for progress.`,
  })
}
