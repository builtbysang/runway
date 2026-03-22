import { pmAgent } from '../agents/pm-agent'

export interface SprintReviewCommandOptions {
  projectKey: string
  cycleId: string
  nextCycleId?: string
}

export async function runSprintReviewCommand(options: SprintReviewCommandOptions) {
  return pmAgent.sprintReview(options)
}
