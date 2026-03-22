import { pmAgent } from '../agents/pm-agent'

export interface WriteSteeringCommandOptions {
  projectKey: string
  context: string
}

export async function runWriteSteeringCommand(options: WriteSteeringCommandOptions) {
  return pmAgent.steering({
    projectKey: options.projectKey,
    context: options.context,
  })
}
