import { pmAgent } from '../agents/pm-agent'

export async function runPlanCommand(projectKey: string, prd: string) {
  const result = await pmAgent.plan({ projectKey, prd })
  return { ok: true, ...result }
}
