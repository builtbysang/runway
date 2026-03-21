/**
 * Runway — PM Agent
 * Takes a PRD → creates full Linear roadmap (projects, sprints, issues)
 */
import { analyzePRD } from '@/skills/claude'
import { createProject, createCycle, createIssue } from '@/skills/linear'
import projectsConfig from '@/projects.json'

type ProjectKey = keyof typeof projectsConfig

export async function runPMAgent(opts: {
  projectKey: ProjectKey
  prd: string
}): Promise<{ projectUrl: string; issueCount: number; summary: string }> {
  const config = projectsConfig[opts.projectKey]
  if (!config) throw new Error(`Unknown project: ${opts.projectKey}`)

  console.log(`[PM Agent] Analyzing PRD for ${opts.projectKey}…`)
  const roadmap = await analyzePRD(opts.prd)

  console.log(
    `[PM Agent] Roadmap: ${roadmap.releases.length} releases, creating on Linear…`
  )

  // Create one Linear Project per release
  let totalIssues = 0
  let firstProjectUrl = ''

  for (const release of roadmap.releases) {
    const project = await createProject({
      teamId: config.linearTeamId,
      name: `${roadmap.projectName} — ${release.name}`,
      description: release.description,
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
        description: sprint.goal,
        startsAt: startDate.toISOString(),
        endsAt: endDate.toISOString(),
      })

      for (const issue of sprint.issues) {
        await createIssue({
          teamId: config.linearTeamId,
          title: issue.title,
          description: issue.description,
          priority: issue.priority,
          estimate: issue.estimate,
          projectId: project.id,
          cycleId: cycle.id,
        })
        totalIssues++
      }
    }
  }

  return {
    projectUrl: firstProjectUrl,
    issueCount: totalIssues,
    summary: `Created ${roadmap.releases.length} releases with ${totalIssues} issues for ${roadmap.projectName}`,
  }
}
