import { pmAgent } from '../agents/pm-agent'

export interface ReportCommandOptions {
  projectKey: string
  cycleId?: string
  stateName?: string
}

export async function runReportCommand(options: ReportCommandOptions) {
  return pmAgent.report(options)
}
