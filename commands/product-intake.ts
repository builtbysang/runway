import { productAgent } from '../agents/product-agent'

export interface ProductIntakeCommandOptions {
  projectKey: string
  brief: string
  figmaUrl?: string
}

export async function runProductIntakeCommand(options: ProductIntakeCommandOptions) {
  return productAgent.intake(options)
}
