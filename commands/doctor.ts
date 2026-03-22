import { spawnSync } from 'node:child_process'
import { readConfig } from '../lib/config'
import { getLlmBackendStatus, hasLlmCredentials } from '../skills/claude'

function commandSucceeds(command: string, args: string[]) {
  const result = spawnSync(command, args, {
    stdio: 'pipe',
    encoding: 'utf8',
  })
  return {
    ok: result.status === 0,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  }
}

export function runDoctorCommand() {
  const projectsConfig = readConfig()
  const projects = Object.entries(projectsConfig)
  const backend = getLlmBackendStatus()
  const checks = {
    llmProvider: backend.provider,
    hasLlmBackend: hasLlmCredentials(),
    hasCodexCli: backend.hasCodexCli,
    hasClaudeCli: backend.hasClaudeCli,
    codexLoginStatus: backend.hasCodexCli ? commandSucceeds('codex', ['login', 'status']).ok : false,
    claudeLoginStatus: backend.hasClaudeCli ? commandSucceeds('claude', ['auth', 'status']).ok : false,
    hasLinearKey: Boolean(process.env.LINEAR_API_KEY),
    hasGithubToken: Boolean(process.env.GITHUB_TOKEN),
    hasNotionToken: Boolean(process.env.NOTION_TOKEN),
    projectCount: projects.length,
    projects: projects.map(([key]) => key),
  }

  const issues: string[] = []

  if (!checks.hasLlmBackend) {
    issues.push('Missing local LLM backend: install and log into Codex CLI or Claude CLI.')
  }
  if (!checks.hasLinearKey) {
    issues.push('Missing LINEAR_API_KEY: product-intake, plan, refine, report, and sprint-review will not work.')
  }
  if (!checks.hasGithubToken) {
    issues.push('Missing GITHUB_TOKEN: Dev Agent cannot read repos or open PRs.')
  }
  if (checks.projectCount === 0) {
    issues.push('No projects configured in projects.json.')
  }
  if (backend.provider === 'codex-cli' && !checks.hasCodexCli) {
    issues.push('RUNWAY_LLM_PROVIDER=codex-cli but the `codex` command is not available.')
  }
  if (backend.provider === 'claude-cli' && !checks.hasClaudeCli) {
    issues.push('RUNWAY_LLM_PROVIDER=claude-cli but the `claude` command is not available.')
  }
  if (backend.provider === 'codex-cli' && checks.hasCodexCli && !checks.codexLoginStatus) {
    issues.push('Codex CLI is installed but does not appear to be logged in.')
  }
  if (backend.provider === 'claude-cli' && checks.hasClaudeCli && !checks.claudeLoginStatus) {
    issues.push('Claude CLI is installed but `claude auth status` did not pass.')
  }
  for (const [key, project] of projects) {
    if (!project.localRepoPath) {
      issues.push(`Project ${key} has no localRepoPath. Dev Agent will fall back to cloning from GitHub instead of using your local codebase.`)
    }
  }

  return {
    ok: issues.length === 0,
    checks,
    issues,
  }
}
