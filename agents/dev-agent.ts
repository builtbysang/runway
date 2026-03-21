/**
 * Runway — Dev Agent
 * Linear issue "In Progress" → Claude implements → GitHub PR → Linear "In Review"
 */
import { implementIssue } from '@/skills/claude'
import { readFiles, createBranchAndPR } from '@/skills/github'
import { updateIssue, addComment } from '@/skills/linear'
import projectsConfig from '@/projects.json'

type ProjectConfig = {
  linearTeamId: string
  githubRepo: string
  techStack?: string
}

export interface LinearIssue {
  id: string
  identifier: string
  title: string
  description: string | null
  teamId: string
}

function findProjectConfig(teamId: string): ProjectConfig | null {
  return (
    Object.values(projectsConfig).find((p) => p.linearTeamId === teamId) || null
  )
}

function resolveFilePaths(issue: LinearIssue, repo: string): string[] {
  const base = ['app/page.tsx', 'package.json']
  const text = `${issue.title} ${issue.description || ''}`.toLowerCase()
  const extra: string[] = []

  if (text.includes('debt')) extra.push('app/debt/page.tsx')
  if (text.includes('invest') || text.includes('fund')) {
    extra.push('app/invest/page.tsx', 'components/investments-table.tsx')
  }
  if (text.includes('goal')) extra.push('app/goals/page.tsx')
  if (text.includes('onboard')) extra.push('components/onboarding-wizard.tsx')
  if (text.includes('nav')) extra.push('components/nav.tsx')
  if (text.includes('component') || text.includes('bar')) {
    extra.push('components/bar-section.tsx')
  }

  return [...new Set([...base, ...extra])]
}

export async function runDevAgent(issue: LinearIssue): Promise<void> {
  const token = process.env.GITHUB_TOKEN || ''
  const config = findProjectConfig(issue.teamId)

  if (!config) {
    console.warn(`[Dev Agent] No project config for team ${issue.teamId}`)
    return
  }

  // 1. Notify Linear we're starting
  await addComment(
    issue.id,
    `🤖 **Runway** is analyzing this issue and will start implementing…`
  )

  // 2. Read relevant files from GitHub
  const paths = resolveFilePaths(issue, config.githubRepo)
  const files = await readFiles(config.githubRepo, paths, token)

  // 3. Ask Claude to implement
  const result = await implementIssue({
    issueTitle: issue.title,
    issueDescription: issue.description || '',
    files,
    techStack: config.techStack,
  })

  if (result.changes.length === 0) {
    await addComment(
      issue.id,
      `⚠️ **Runway** couldn't implement this automatically:\n\n${result.summary}`
    )
    return
  }

  // 4. Create branch + PR on GitHub
  const branchName = `runway/${issue.identifier.toLowerCase()}-${Date.now()}`
  const pr = await createBranchAndPR({
    repo: config.githubRepo,
    branchName,
    changes: result.changes,
    commitMessage: `feat(${issue.identifier}): ${issue.title}`,
    prTitle: `[${issue.identifier}] ${issue.title}`,
    prBody: result.prDescription,
    token,
  })

  // 5. Update Linear: In Review + PR link
  await updateIssue(issue.id, {
    statusName: 'In Review',
    teamId: issue.teamId,
    comment: `✅ **PR ready:** ${pr.url}\n\n**Summary:** ${result.summary}`,
  })

  console.log(`[Dev Agent] Done: ${issue.identifier} → ${pr.url}`)
}
