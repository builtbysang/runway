import { pmAgent } from '../agents/pm-agent'

export interface RefineCommandOptions {
  projectKey: string
  issueIds?: string[]
  stateName?: string
  limit?: number
}

export async function runRefineCommand(options: RefineCommandOptions) {
  return pmAgent.refine(options)
}
