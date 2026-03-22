/**
 * POST /api/sprint/review
 * Sprint retrospective agent:
 *   1. Fetches all issues in a cycle
 *   2. Claude analyses done vs not-done, generates retro report
 *   3. Posts retrospective comment on each incomplete issue
 *   4. Optionally creates carry-over issues in the next sprint
 *
 * Body:
 *   projectKey    — key from projects.json
 *   cycleId       — Linear cycle/sprint ID to review
 *   nextCycleId?  — if provided, carry-over issues are added to this sprint
 */
import { NextRequest, NextResponse } from 'next/server'
import { generateSprintReview } from '@/skills/claude'
import { listIssues, listCycles, addComment, createIssue } from '@/skills/linear'
import projectsConfig from '@/projects.json'

type ProjectKey = keyof typeof projectsConfig

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    projectKey: ProjectKey
    cycleId: string
    nextCycleId?: string
  }

  if (!body.cycleId) {
    return NextResponse.json({ error: 'cycleId is required' }, { status: 400 })
  }

  const config = projectsConfig[body.projectKey]
  if (!config) {
    return NextResponse.json({ error: `Unknown projectKey: ${body.projectKey}` }, { status: 400 })
  }

  // Fetch all issues in the sprint (no state filter)
  const allIssues = await listIssues({ teamId: config.linearTeamId, cycleId: body.cycleId })

  const doneIssues = allIssues.filter(i => i.state.name.toLowerCase() === 'done')
  const notDoneIssues = allIssues.filter(i => i.state.name.toLowerCase() !== 'done')

  // Get sprint name from cycles list
  const cycles = await listCycles(config.linearTeamId)
  const cycle = cycles.find(c => c.id === body.cycleId)
  const sprintName = cycle?.name ?? `Sprint (${body.cycleId.slice(0, 8)})`

  console.log(
    `[Sprint Review] ${sprintName}: ${doneIssues.length} done, ${notDoneIssues.length} not done`
  )

  const review = await generateSprintReview({
    sprintName,
    doneIssues: doneIssues.map(i => ({ id: i.id, identifier: i.identifier, title: i.title })),
    notDoneIssues: notDoneIssues.map(i => ({ id: i.id, identifier: i.identifier, title: i.title })),
  })

  // Post retrospective comment on all incomplete issues
  const retroBody = `## 🔁 Sprint Retrospective — ${sprintName}

**Completion:** ${review.completionRate}% (${review.velocity}/${review.plannedVelocity}pts)

${review.summary}

**Next sprint recommendations:**
${review.recommendations.map(r => `- ${r}`).join('\n')}

*This issue was not completed this sprint and has been flagged for carry-over.*`

  for (const issue of notDoneIssues) {
    await addComment(issue.id, retroBody).catch(err =>
      console.error(`[Sprint Review] Failed to comment on ${issue.identifier}:`, err)
    )
  }

  // Create carry-over issues in next sprint if provided
  const carryOverCreated: { identifier?: string; title: string }[] = []

  if (body.nextCycleId && review.carryOvers.length > 0) {
    for (const co of review.carryOvers) {
      const source = notDoneIssues.find(i => i.id === co.issueId)
      if (!source) continue

      try {
        const created = await createIssue({
          teamId: config.linearTeamId,
          title: `[Carry-over] ${source.title}`,
          description: `Carried over from ${sprintName}.\n\n**Reason:** ${co.reason}\n\n---\n${source.description || ''}`,
          priority: source.priority,
          cycleId: body.nextCycleId,
        })
        carryOverCreated.push({ identifier: created.identifier, title: source.title })
        console.log(`[Sprint Review] Carry-over created: ${created.identifier}`)
      } catch (err) {
        console.error(`[Sprint Review] Failed carry-over for ${source.identifier}:`, err)
      }
    }
  }

  return NextResponse.json({
    ok: true,
    sprintName,
    velocity: review.velocity,
    plannedVelocity: review.plannedVelocity,
    completionRate: review.completionRate,
    summary: review.summary,
    recommendations: review.recommendations,
    carryOversCreated: carryOverCreated.length,
    carryOvers: carryOverCreated,
  })
}
