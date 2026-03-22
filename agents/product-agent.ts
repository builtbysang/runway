import { getProjectConfig } from '../lib/config'
import { analyzeFeatureRequest } from '../skills/claude'
import { createIssue, findOrCreateLabel } from '../skills/linear'

const WORKSTREAM_COLORS = {
  frontend: '#3b82f6',
  backend: '#8b5cf6',
  fullstack: '#14b8a6',
} as const

const REVIEW_LABEL = {
  name: 'needs-review',
  color: '#f59e0b',
}

const DESIGN_LABEL = {
  name: 'needs-design',
  color: '#ec4899',
}

export async function intake(opts: {
  projectKey: string
  brief: string
  figmaUrl?: string
}) {
  const config = getProjectConfig(opts.projectKey)

  const analysis = await analyzeFeatureRequest({
    brief: opts.brief,
    figmaUrl: opts.figmaUrl,
  })

  const reviewLabelId = await findOrCreateLabel(
    config.linearTeamId,
    REVIEW_LABEL.name,
    REVIEW_LABEL.color,
  )

  const designLabelId = await findOrCreateLabel(
    config.linearTeamId,
    DESIGN_LABEL.name,
    DESIGN_LABEL.color,
  )

  const createdIssues: Array<{
    id: string
    identifier: string
    title: string
    workstream: string
    needsDesign: boolean
  }> = []

  for (const issue of analysis.issues) {
    const workstreamLabelId = await findOrCreateLabel(
      config.linearTeamId,
      issue.workstream,
      WORKSTREAM_COLORS[issue.workstream],
    )

    const labelIds = issue.needsDesign
      ? [reviewLabelId, designLabelId, workstreamLabelId]
      : [reviewLabelId, workstreamLabelId]

    const created = await createIssue({
      teamId: config.linearTeamId,
      title: issue.title,
      description: issue.description,
      priority: issue.priority,
      labelIds,
    })

    createdIssues.push({
      id: created.id,
      identifier: created.identifier,
      title: created.title,
      workstream: issue.workstream,
      needsDesign: issue.needsDesign,
    })
  }

  return {
    ok: true,
    summary: analysis.summary,
    shouldBuildNow: analysis.shouldBuildNow,
    created: createdIssues.length,
    issues: createdIssues,
  }
}

export const productAgent = {
  intake,
}
