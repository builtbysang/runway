import { runDevAgent } from '../agents/dev-agent'
import { getProjectConfig } from '../lib/config'
import { listIssues, updateIssue } from '../skills/linear'

export interface RunCommandOptions {
  projectKey: string
  cycleId?: string
  stateName?: string
  issueIds?: string[]
}

export async function runIssuesCommand(options: RunCommandOptions) {
  const config = getProjectConfig(options.projectKey)

  let issues
  if (options.issueIds?.length) {
    const all = await listIssues({ teamId: config.linearTeamId })
    issues = all.filter((issue) =>
      options.issueIds?.includes(issue.id) || options.issueIds?.includes(issue.identifier),
    )
  } else {
    issues = await listIssues({
      teamId: config.linearTeamId,
      cycleId: options.cycleId,
      stateName: options.stateName ?? 'Todo',
    })
  }

  if (issues.length === 0) {
    return { ok: true, message: 'No issues found matching the filter', ran: 0 }
  }

  console.log(`[run] Starting batch: ${issues.length} issues for ${options.projectKey}`)

  for (const issue of issues) {
    console.log(`[run] Processing ${issue.identifier}: ${issue.title}`)
    try {
      await updateIssue(issue.id, { statusName: 'In Progress', teamId: issue.teamId })
      await runDevAgent({
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        description: issue.description,
        teamId: issue.teamId,
        labels: issue.labels,
      })
    } catch (error) {
      console.error(`[run] Failed ${issue.identifier}:`, error)
    }
  }

  return {
    ok: true,
    ran: issues.length,
    issues: issues.map((issue) => ({ id: issue.identifier, title: issue.title })),
    message: `Processed ${issues.length} issues sequentially.`,
  }
}
