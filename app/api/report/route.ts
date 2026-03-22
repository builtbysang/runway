/**
 * POST /api/report
 * Generate a markdown progress report for a project or sprint.
 *
 * Body:
 *   projectKey  — key from projects.json
 *   cycleId?    — if provided, scoped to that sprint; otherwise all team issues
 *   stateName?  — optional extra state filter (e.g. "In Progress")
 *
 * Returns: { ok, report, stats }
 * The report field is a markdown string ready to paste into Notion, Slack, or a PR.
 */
import { NextRequest, NextResponse } from 'next/server'
import { buildProgressReport } from '@/skills/claude'
import { listIssues, listCycles } from '@/skills/linear'
import projectsConfig from '@/projects.json'

type ProjectKey = keyof typeof projectsConfig

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    projectKey: ProjectKey
    cycleId?: string
    stateName?: string
  }

  const config = projectsConfig[body.projectKey]
  if (!config) {
    return NextResponse.json({ error: `Unknown projectKey: ${body.projectKey}` }, { status: 400 })
  }

  const issues = await listIssues({
    teamId: config.linearTeamId,
    cycleId: body.cycleId,
    stateName: body.stateName,
  })

  // Resolve sprint name if cycleId given
  let sprintName: string | undefined
  if (body.cycleId) {
    const cycles = await listCycles(config.linearTeamId)
    sprintName = cycles.find(c => c.id === body.cycleId)?.name
  }

  const projectName = config.description || body.projectKey

  const report = buildProgressReport({
    projectName,
    sprintName,
    issues,
  })

  // Quick stats summary
  const total = issues.length
  const done = issues.filter(i => i.state.name.toLowerCase() === 'done').length
  const inProgress = issues.filter(i => i.state.name.toLowerCase() === 'in progress').length

  return NextResponse.json({
    ok: true,
    stats: {
      total,
      done,
      inProgress,
      todo: total - done - inProgress,
      completionRate: total > 0 ? Math.round((done / total) * 100) : 0,
    },
    report,
  })
}
