import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pmAgent } from '../agents/pm-agent'

export interface WriteReportCommandOptions {
  projectKey: string
  cycleId?: string
  stateName?: string
  output?: string
}

function defaultOutputPath(projectKey: string, cycleId?: string) {
  const suffix = cycleId ? `-${cycleId}` : ''
  return resolve(process.cwd(), 'docs', 'reports', `${projectKey}${suffix}.md`)
}

export async function runWriteReportCommand(options: WriteReportCommandOptions) {
  const result = await pmAgent.report({
    projectKey: options.projectKey,
    cycleId: options.cycleId,
    stateName: options.stateName,
  })

  const outputPath = options.output
    ? resolve(process.cwd(), options.output)
    : defaultOutputPath(options.projectKey, options.cycleId)

  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${result.report}\n`, 'utf-8')

  return {
    ok: true,
    outputPath,
    stats: result.stats,
  }
}
