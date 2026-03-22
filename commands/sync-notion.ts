import { pmAgent } from '../agents/pm-agent'

export interface SyncNotionCommandOptions {
  projectKey: string
  cycleId?: string
  stateName?: string
  pageId?: string
}

export async function runSyncNotionCommand(options: SyncNotionCommandOptions) {
  return pmAgent.syncNotion(options)
}
