/**
 * Runway — Dev Agent
 * Linear issue "In Progress" → Claude (tool-use loop) → GitHub PR → Linear "In Review"
 *
 * Claude uses read_file / list_dir / write_file tools to autonomously explore
 * the codebase and implement — no manual file pre-fetching needed.
 */
import { hasLlmCredentials, implementIssue } from '../skills/claude'
import { createBranchAndPR } from '../skills/github'
import { updateIssue, addComment, getIssueLabels } from '../skills/linear'
import { readProjectContext } from '../skills/notion'
import projectsConfig from '../projects.json'

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
  labels?: string[]
}

function findProjectConfig(teamId: string): ProjectConfig | null {
  return Object.values(projectsConfig).find(p => p.linearTeamId === teamId) || null
}

async function failIssue(issueId: string, message: string) {
  await addComment(issueId, `⚠️ **Runway** stopped before opening a PR.\n\n${message}`)
}

export async function runDevAgent(issue: LinearIssue): Promise<void> {
  const token = process.env.GITHUB_TOKEN || ''
  const config = findProjectConfig(issue.teamId)

  if (!config) {
    console.warn(`[Dev Agent] No project config for team ${issue.teamId}`)
    await failIssue(issue.id, `Missing project config for team ${issue.teamId}.`)
    return
  }

  if (!hasLlmCredentials()) {
    await failIssue(
      issue.id,
      'Missing LLM credentials. Set `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` and optionally `RUNWAY_LLM_PROVIDER`.',
    )
    return
  }

  if (!token) {
    await failIssue(issue.id, 'Missing `GITHUB_TOKEN` in the runtime environment.')
    return
  }

  // 1. Notify Linear
  await addComment(issue.id, `🤖 **Runway** is analyzing this issue and will start implementing…`)

  try {
    // 2. Fetch labels + Notion context in parallel (both optional)
    const [labels, projectContext] = await Promise.all([
      issue.labels ? Promise.resolve(issue.labels) : getIssueLabels(issue.id),
      config.notionContextPageId
        ? readProjectContext(config.notionContextPageId)
        : Promise.resolve(null),
    ])

    console.log(`[Dev Agent] ${issue.identifier} labels=[${labels.join(', ')}]`)
    await addComment(issue.id, `🛠️ **Runway** is implementing this issue against \`${config.githubRepo}\`.`)

    // 3. Claude agentic loop — reads files itself via tools, stages changes
    const result = await implementIssue({
      issueTitle: issue.title,
      issueDescription: issue.description || '',
      repo: config.githubRepo,
      token,
      techStack: config.techStack,
      projectContext: projectContext ?? undefined,
      labels,
    })

    if (result.changes.length === 0) {
      await addComment(issue.id, `⚠️ **Runway** couldn't implement this automatically:\n\n${result.summary}`)
      return
    }

    await addComment(issue.id, `📦 **Runway** staged ${result.changes.length} file change(s) and is opening a PR…`)

    // 4. Create branch + PR
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

    // 5. Linear → In Review + PR link
    await updateIssue(issue.id, {
      statusName: 'In Review',
      teamId: issue.teamId,
      comment: `✅ **PR ready:** ${pr.url}\n\n**Summary:** ${result.summary}`,
    })

    console.log(`[Dev Agent] Done: ${issue.identifier} → ${pr.url}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[Dev Agent] Failed ${issue.identifier}:`, error)
    await failIssue(issue.id, message)
  }
}
