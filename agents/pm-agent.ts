/**
 * Runway — PM Agent
 * Planning, issue refinement, reporting, and Notion sync.
 */
import { getProjectConfig } from '../lib/config'
import {
  analyzePRD,
  buildProgressReport,
  generateSprintReview,
  type Roadmap,
  type RoadmapPhase,
  type RoadmapRelease,
  type Workstream,
  refineIssues,
} from '../skills/claude'
import {
  addComment,
  addLabelToIssue,
  createCycle,
  createIssue,
  createProject,
  findOrCreateLabel,
  listCycles,
  listIssues,
  updateIssueDetails,
} from '../skills/linear'
import { readProjectContext, replacePageContent } from '../skills/notion'

const COMPLEXITY_COLORS: Record<string, string> = {
  simple: '#22c55e',
  normal: '#f59e0b',
  complex: '#ef4444',
}

const WORKSTREAM_COLORS: Record<Workstream, string> = {
  frontend: '#3b82f6',
  backend: '#8b5cf6',
  fullstack: '#14b8a6',
}

export interface PMPlanOptions {
  projectKey: string
  prd: string
}

export interface PMRefineOptions {
  projectKey: string
  issueIds?: string[]
  stateName?: string
  limit?: number
}

export interface PMReportOptions {
  projectKey: string
  cycleId?: string
  stateName?: string
}

export interface PMSyncNotionOptions {
  projectKey: string
  cycleId?: string
  stateName?: string
  pageId?: string
}

function normalizeRoadmapPhases(roadmap: Roadmap): RoadmapPhase[] {
  if (roadmap.phases?.length) {
    return roadmap.phases
  }

  const fallbackReleases: RoadmapRelease[] = roadmap.releases ?? []
  return [
    {
      name: 'Phase 1 — Delivery',
      goal: roadmap.projectDescription,
      releases: fallbackReleases,
    },
  ]
}

async function plan(opts: PMPlanOptions): Promise<{ projectUrl: string; issueCount: number; summary: string }> {
  const config = getProjectConfig(opts.projectKey)

  console.log(`[PM Agent] Analyzing PRD for ${opts.projectKey}…`)
  const roadmap = await analyzePRD(opts.prd)
  const phases = normalizeRoadmapPhases(roadmap)

  console.log(
    `[PM Agent] Roadmap: ${phases.length} phases, creating on Linear…`
  )

  // Create one Linear Project per release, grouped under phases in the description/title.
  let totalIssues = 0
  let firstProjectUrl = ''
  let releaseCount = 0

  for (const phase of phases) {
    for (const release of phase.releases) {
      releaseCount += 1
      const project = await createProject({
        teamId: config.linearTeamId,
        name: `${roadmap.projectName} — ${release.name}`,
        description: [
          `Phase: ${phase.name}`,
          '',
          `Phase Goal: ${phase.goal}`,
          '',
          release.description,
        ].join('\n'),
      })

      if (!firstProjectUrl) firstProjectUrl = project.url

      // Create cycles (sprints) and issues
      const now = new Date()

      for (const sprint of release.sprints) {
        const startDate = new Date(now)
        startDate.setDate(now.getDate() + sprint.startWeek * 7)
        const endDate = new Date(startDate)
        endDate.setDate(startDate.getDate() + sprint.durationWeeks * 7)

        const cycle = await createCycle({
          teamId: config.linearTeamId,
          name: sprint.name,
          description: [
            `Phase: ${phase.name}`,
            `Release: ${release.name}`,
            '',
            sprint.goal,
          ].join('\n'),
          startsAt: startDate.toISOString(),
          endsAt: endDate.toISOString(),
        })

        for (const issue of sprint.issues) {
          const workstreamLabelId = await findOrCreateLabel(
            config.linearTeamId,
            issue.workstream,
            WORKSTREAM_COLORS[issue.workstream],
          )
          await createIssue({
            teamId: config.linearTeamId,
            title: issue.title,
            description: issue.description,
            priority: issue.priority,
            estimate: issue.estimate,
            labelIds: [workstreamLabelId],
            projectId: project.id,
            cycleId: cycle.id,
          })
          totalIssues++
        }
      }
    }
  }

  return {
    projectUrl: firstProjectUrl,
    issueCount: totalIssues,
    summary: `Created ${phases.length} phases, ${releaseCount} releases, and ${totalIssues} issues for ${roadmap.projectName}`,
  }
}

async function refine(opts: PMRefineOptions) {
  const config = getProjectConfig(opts.projectKey)

  let issues
  if (opts.issueIds?.length) {
    const all = await listIssues({ teamId: config.linearTeamId })
    issues = all.filter((issue) => opts.issueIds?.includes(issue.id) || opts.issueIds?.includes(issue.identifier))
  } else {
    issues = await listIssues({
      teamId: config.linearTeamId,
      stateName: opts.stateName ?? 'Backlog',
    })
  }

  issues = issues.slice(0, opts.limit ?? 10)

  if (issues.length === 0) {
    return { ok: true, message: 'No issues found', refined: 0 }
  }

  const projectContext = config.notionContextPageId
    ? await readProjectContext(config.notionContextPageId).catch(() => null)
    : null

  const refinedIssues = await refineIssues({
    issues: issues.map((issue) => ({
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      description: issue.description,
    })),
    repo: config.githubRepo,
    token: process.env.GITHUB_TOKEN || '',
    techStack: config.techStack,
    projectContext: projectContext ?? undefined,
  })

  const results: { identifier: string; estimate: number; complexity: string; workstream: Workstream }[] = []

  for (const result of refinedIssues) {
    const issue = issues.find((entry) => entry.id === result.issueId)
    if (!issue) continue

    try {
      await updateIssueDetails(result.issueId, {
        description: result.description,
        estimate: result.estimate,
      })

      const labelId = await findOrCreateLabel(
        config.linearTeamId,
        result.complexity,
        COMPLEXITY_COLORS[result.complexity],
      )
      await addLabelToIssue(result.issueId, labelId)

      const workstreamLabelId = await findOrCreateLabel(
        config.linearTeamId,
        result.workstream,
        WORKSTREAM_COLORS[result.workstream],
      )
      await addLabelToIssue(result.issueId, workstreamLabelId)

      await addComment(
        result.issueId,
        `Runway refined this issue.\n\n${result.summary}\n\nEstimate: ${result.estimate}pts | Complexity: ${result.complexity} | Workstream: ${result.workstream}`,
      )

      results.push({
        identifier: issue.identifier,
        estimate: result.estimate,
        complexity: result.complexity,
        workstream: result.workstream,
      })
    } catch (error) {
      console.error(`[PM Agent] Refine failed ${issue.identifier}:`, error)
    }
  }

  return {
    ok: true,
    refined: results.length,
    issues: results,
  }
}

async function report(opts: PMReportOptions) {
  const config = getProjectConfig(opts.projectKey)
  const issues = await listIssues({
    teamId: config.linearTeamId,
    cycleId: opts.cycleId,
    stateName: opts.stateName,
  })

  let sprintName: string | undefined
  if (opts.cycleId) {
    const cycles = await listCycles(config.linearTeamId)
    sprintName = cycles.find((cycle) => cycle.id === opts.cycleId)?.name
  }

  const reportBody = buildProgressReport({
    projectName: config.description || opts.projectKey,
    sprintName,
    issues,
  })

  const total = issues.length
  const done = issues.filter((issue) => issue.state.name.toLowerCase() === 'done').length
  const inProgress = issues.filter((issue) => issue.state.name.toLowerCase() === 'in progress').length

  return {
    ok: true,
    stats: {
      total,
      done,
      inProgress,
      todo: total - done - inProgress,
      completionRate: total > 0 ? Math.round((done / total) * 100) : 0,
    },
    report: reportBody,
  }
}

async function syncNotion(opts: PMSyncNotionOptions) {
  const config = getProjectConfig(opts.projectKey)
  const pageId = opts.pageId || config.notionSyncPageId || config.notionContextPageId

  if (!pageId) {
    throw new Error('No Notion page configured. Add notionSyncPageId or notionContextPageId to the project config.')
  }

  const reportResult = await report({
    projectKey: opts.projectKey,
    cycleId: opts.cycleId,
    stateName: opts.stateName,
  })

  const now = new Date().toISOString()
  const markdown = [
    `# ${config.description || opts.projectKey} Status Sync`,
    '',
    `Updated: ${now}`,
    '',
    '## Snapshot',
    `- Total issues: ${reportResult.stats.total}`,
    `- Done: ${reportResult.stats.done}`,
    `- In Progress: ${reportResult.stats.inProgress}`,
    `- Todo: ${reportResult.stats.todo}`,
    `- Completion rate: ${reportResult.stats.completionRate}%`,
    '',
    '## Report',
    reportResult.report,
  ].join('\n')

  await replacePageContent(pageId, markdown)

  return {
    ok: true,
    pageId,
    syncedAt: now,
    stats: reportResult.stats,
  }
}

async function sprintReview(opts: { projectKey: string; cycleId: string; nextCycleId?: string }) {
  const config = getProjectConfig(opts.projectKey)

  const allIssues = await listIssues({ teamId: config.linearTeamId, cycleId: opts.cycleId })
  const doneIssues = allIssues.filter((issue) => issue.state.name.toLowerCase() === 'done')
  const notDoneIssues = allIssues.filter((issue) => issue.state.name.toLowerCase() !== 'done')

  const cycles = await listCycles(config.linearTeamId)
  const cycle = cycles.find((entry) => entry.id === opts.cycleId)
  const sprintName = cycle?.name ?? `Sprint (${opts.cycleId.slice(0, 8)})`

  const review = await generateSprintReview({
    sprintName,
    doneIssues: doneIssues.map((issue) => ({
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
    })),
    notDoneIssues: notDoneIssues.map((issue) => ({
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
    })),
  })

  const retroBody = `## Sprint Retrospective - ${sprintName}

Completion: ${review.completionRate}% (${review.velocity}/${review.plannedVelocity}pts)

${review.summary}

Next sprint recommendations:
${review.recommendations.map((recommendation) => `- ${recommendation}`).join('\n')}

This issue was not completed this sprint and has been flagged for carry-over.`

  for (const issue of notDoneIssues) {
    await addComment(issue.id, retroBody).catch((error) =>
      console.error(`[PM Agent] Sprint review failed to comment on ${issue.identifier}:`, error),
    )
  }

  const carryOvers: { identifier?: string; title: string }[] = []

  if (opts.nextCycleId && review.carryOvers.length > 0) {
    for (const carryOver of review.carryOvers) {
      const source = notDoneIssues.find((issue) => issue.id === carryOver.issueId)
      if (!source) continue

      try {
        const created = await createIssue({
          teamId: config.linearTeamId,
          title: `[Carry-over] ${source.title}`,
          description: `Carried over from ${sprintName}.\n\nReason: ${carryOver.reason}\n\n---\n${source.description || ''}`,
          priority: source.priority,
          cycleId: opts.nextCycleId,
        })
        carryOvers.push({ identifier: created.identifier, title: source.title })
      } catch (error) {
        console.error(`[PM Agent] Sprint review carry-over failed for ${source.identifier}:`, error)
      }
    }
  }

  return {
    ok: true,
    sprintName,
    velocity: review.velocity,
    plannedVelocity: review.plannedVelocity,
    completionRate: review.completionRate,
    summary: review.summary,
    recommendations: review.recommendations,
    carryOversCreated: carryOvers.length,
    carryOvers,
  }
}

export const pmAgent = {
  plan,
  refine,
  report,
  syncNotion,
  sprintReview,
}

export async function runPMAgent(opts: PMPlanOptions) {
  return pmAgent.plan(opts)
}
