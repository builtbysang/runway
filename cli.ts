import { config as loadEnv } from 'dotenv'
import { runPlanCommand } from './commands/plan'
import { runDoctorCommand } from './commands/doctor'
import { addProjectCommand, listProjectsCommand } from './commands/projects'
import { runProductIntakeCommand } from './commands/product-intake'
import { runRefineCommand } from './commands/refine'
import { runReportCommand } from './commands/report'
import { runIssuesCommand } from './commands/run'
import { runSprintReviewCommand } from './commands/sprint-review'
import { runSyncNotionCommand } from './commands/sync-notion'
import { runWriteReportCommand } from './commands/write-report'
import { runWriteSteeringCommand } from './commands/write-steering'
import { readConfig } from './lib/config'
import {
  getStringFlag,
  getNumberFlag,
  getStringArrayFlag,
  parseArgs,
  printJson,
  readTextInput,
  requireStringFlag,
} from './lib/cli'

loadEnv({ path: '.env.local', override: true })

function resolveProjectKey(flags: Record<string, string | boolean>): string {
  const explicit = getStringFlag(flags, 'project')
  if (explicit) {
    return explicit
  }

  const fromEnv = process.env.RUNWAY_DEFAULT_PROJECT
  if (fromEnv) {
    return fromEnv
  }

  const projectKeys = Object.keys(readConfig())
  if (projectKeys.length === 1) {
    return projectKeys[0]
  }

  throw new Error('Missing required flag: --project (or set RUNWAY_DEFAULT_PROJECT).')
}

function printHelp() {
  process.stdout.write(`Runway CLI

Usage:
  runway doctor
  runway product-intake [--project <key>] --brief-file <file> [--figma-url <url>]
  runway plan [--project <key>] --prd-file <file>
  runway run [--project <key>] [--cycle <id>] [--state <name>] [--issues BUI-1,BUI-2]
  runway refine [--project <key>] [--state <name>] [--limit <n>] [--issues BUI-1,BUI-2]
  runway report [--project <key>] [--cycle <id>] [--state <name>]
  runway write-report [--project <key>] [--cycle <id>] [--state <name>] [--output <path>]
  runway write-steering [--project <key>] --context-file <file>
  runway sprint-review [--project <key>] --cycle <id> [--next-cycle <id>]
  runway sync-notion [--project <key>] [--cycle <id>] [--state <name>] [--page-id <id>]
  runway projects list
  runway projects add --key <key> --team-id <id> --repo <org/repo> [--local-repo-path <path>] [--description <text>] [--tech-stack <text>] [--notion-page-id <id>] [--notion-sync-page-id <id>]

Notes:
  --project is optional when there is only one configured project or RUNWAY_DEFAULT_PROJECT is set.
`)
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2))
  const [command, subcommand] = parsed.command

  if (!command || command === 'help' || parsed.flags.help === true) {
    printHelp()
    return
  }

  if (command === 'doctor') {
    printJson(runDoctorCommand())
    return
  }

  if (command === 'plan') {
    const result = await runPlanCommand(
      resolveProjectKey(parsed.flags),
      readTextInput(parsed.flags, 'prd', 'prd-file'),
    )
    printJson(result)
    return
  }

  if (command === 'product-intake') {
    const result = await runProductIntakeCommand({
      projectKey: resolveProjectKey(parsed.flags),
      brief: readTextInput(parsed.flags, 'brief', 'brief-file'),
      figmaUrl: typeof parsed.flags['figma-url'] === 'string' ? parsed.flags['figma-url'] : undefined,
    })
    printJson(result)
    return
  }

  if (command === 'run') {
    const result = await runIssuesCommand({
      projectKey: resolveProjectKey(parsed.flags),
      cycleId: typeof parsed.flags.cycle === 'string' ? parsed.flags.cycle : undefined,
      stateName: typeof parsed.flags.state === 'string' ? parsed.flags.state : undefined,
      issueIds: getStringArrayFlag(parsed.flags, 'issues'),
    })
    printJson(result)
    return
  }

  if (command === 'refine') {
    const result = await runRefineCommand({
      projectKey: resolveProjectKey(parsed.flags),
      issueIds: getStringArrayFlag(parsed.flags, 'issues'),
      stateName: typeof parsed.flags.state === 'string' ? parsed.flags.state : undefined,
      limit: getNumberFlag(parsed.flags, 'limit'),
    })
    printJson(result)
    return
  }

  if (command === 'report') {
    const result = await runReportCommand({
      projectKey: resolveProjectKey(parsed.flags),
      cycleId: typeof parsed.flags.cycle === 'string' ? parsed.flags.cycle : undefined,
      stateName: typeof parsed.flags.state === 'string' ? parsed.flags.state : undefined,
    })
    printJson(result)
    return
  }

  if (command === 'write-report') {
    const result = await runWriteReportCommand({
      projectKey: resolveProjectKey(parsed.flags),
      cycleId: typeof parsed.flags.cycle === 'string' ? parsed.flags.cycle : undefined,
      stateName: typeof parsed.flags.state === 'string' ? parsed.flags.state : undefined,
      output: typeof parsed.flags.output === 'string' ? parsed.flags.output : undefined,
    })
    printJson(result)
    return
  }

  if (command === 'write-steering') {
    const result = await runWriteSteeringCommand({
      projectKey: resolveProjectKey(parsed.flags),
      context: readTextInput(parsed.flags, 'context', 'context-file'),
    })
    printJson(result)
    return
  }

  if (command === 'sprint-review') {
    const result = await runSprintReviewCommand({
      projectKey: resolveProjectKey(parsed.flags),
      cycleId: requireStringFlag(parsed.flags, 'cycle'),
      nextCycleId: typeof parsed.flags['next-cycle'] === 'string'
        ? parsed.flags['next-cycle']
        : undefined,
    })
    printJson(result)
    return
  }

  if (command === 'sync-notion') {
    const result = await runSyncNotionCommand({
      projectKey: resolveProjectKey(parsed.flags),
      cycleId: typeof parsed.flags.cycle === 'string' ? parsed.flags.cycle : undefined,
      stateName: typeof parsed.flags.state === 'string' ? parsed.flags.state : undefined,
      pageId: typeof parsed.flags['page-id'] === 'string' ? parsed.flags['page-id'] : undefined,
    })
    printJson(result)
    return
  }

  if (command === 'projects' && subcommand === 'list') {
    printJson(listProjectsCommand())
    return
  }

  if (command === 'projects' && subcommand === 'add') {
    const result = addProjectCommand({
      key: requireStringFlag(parsed.flags, 'key'),
      linearTeamId: requireStringFlag(parsed.flags, 'team-id'),
      githubRepo: requireStringFlag(parsed.flags, 'repo'),
      localRepoPath: typeof parsed.flags['local-repo-path'] === 'string'
        ? parsed.flags['local-repo-path']
        : undefined,
      description: typeof parsed.flags.description === 'string' ? parsed.flags.description : undefined,
      techStack: typeof parsed.flags['tech-stack'] === 'string' ? parsed.flags['tech-stack'] : undefined,
      notionContextPageId: typeof parsed.flags['notion-page-id'] === 'string'
        ? parsed.flags['notion-page-id']
        : undefined,
      notionSyncPageId: typeof parsed.flags['notion-sync-page-id'] === 'string'
        ? parsed.flags['notion-sync-page-id']
        : undefined,
    })
    printJson(result)
    return
  }

  throw new Error(`Unknown command: ${parsed.command.join(' ')}`)
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`${message}\n`)
  process.exitCode = 1
})
