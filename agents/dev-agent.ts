/**
 * Runway — Dev Agent
 * Linear issue "In Progress" → Claude implements → GitHub PR → Linear "In Review"
 */
import { implementIssue } from '@/skills/claude'
import { readFiles, createBranchAndPR } from '@/skills/github'
import { updateIssue, addComment } from '@/skills/linear'
import { readProjectContext } from '@/skills/notion'
import projectsConfig from '@/projects.json'

type ProjectConfig = {
  linearTeamId: string
  githubRepo: string
  techStack?: string
  notionContextPageId?: string
}

export interface LinearIssue {
  id: string
  identifier: string
  title: string
  description: string | null
  teamId: string
}

function findProjectConfig(teamId: string): ProjectConfig | null {
  return Object.values(projectsConfig).find((p) => p.linearTeamId === teamId) || null
}

/**
 * Resolve which source files to read from GitHub based on issue keywords.
 * Keeps the list tight — every extra file costs tokens.
 */
function resolveFilePaths(issue: LinearIssue): string[] {
  const base = ['app/page.tsx', 'package.json']
  const text = `${issue.title} ${issue.description || ''}`.toLowerCase()
  const extra: string[] = []

  // Asset / account features
  if (text.includes('tài khoản') || text.includes('account') || text.includes('bank')) {
    extra.push('app/accounts/page.tsx', 'components/account-list.tsx')
  }
  if (text.includes('quỹ') || text.includes('fund') || text.includes('invest')) {
    extra.push('app/invest/page.tsx', 'components/investments-table.tsx')
  }
  if (text.includes('tài sản') || text.includes('asset') || text.includes('net worth')) {
    extra.push('app/assets/page.tsx', 'components/asset-summary.tsx')
  }
  if (text.includes('snapshot') || text.includes('chart') || text.includes('history')) {
    extra.push('components/net-worth-chart.tsx')
  }
  // General UI
  if (text.includes('nav') || text.includes('menu') || text.includes('sidebar')) {
    extra.push('components/nav.tsx')
  }
  if (text.includes('onboard')) {
    extra.push('components/onboarding-wizard.tsx')
  }
  if (text.includes('debt')) {
    extra.push('app/debt/page.tsx')
  }
  if (text.includes('goal') || text.includes('mục tiêu')) {
    extra.push('app/goals/page.tsx')
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
  await addComment(issue.id, `🤖 **Runway** is analyzing this issue and will start implementing…`)

  // 2. Fetch project context from Notion + source files from GitHub in parallel
  const [projectContext, files] = await Promise.all([
    config.notionContextPageId
      ? readProjectContext(config.notionContextPageId)
      : Promise.resolve(null),
    readFiles(config.githubRepo, resolveFilePaths(issue), token),
  ])

  if (projectContext) {
    console.log(`[Dev Agent] Loaded Notion context (${projectContext.length} chars)`)
  }

  // 3. Ask Claude to implement (model auto-selected by complexity)
  const result = await implementIssue({
    issueTitle: issue.title,
    issueDescription: issue.description || '',
    files,
    techStack: config.techStack,
    projectContext: projectContext ?? undefined,
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
