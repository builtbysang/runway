/**
 * Runway — Linear API skill
 * Create projects, cycles, issues; update state; add comments; refine; review sprints
 */

const LINEAR_API = 'https://api.linear.app/graphql'

interface GraphQLResponse<TData> {
  data: TData
  errors?: unknown
}

async function gql<TData = Record<string, unknown>>(query: string, variables?: Record<string, unknown>) {
  const res = await fetch(LINEAR_API, {
    method: 'POST',
    headers: {
      Authorization: process.env.LINEAR_API_KEY || '',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json() as GraphQLResponse<TData>
  if (json.errors) throw new Error(JSON.stringify(json.errors))
  return json.data as TData
}

export async function getWorkflowStates(teamId: string) {
  const data = await gql(`query { team(id: "${teamId}") { states { nodes { id name } } } }`) as {
    team: { states: { nodes: { id: string; name: string }[] } }
  }
  return data.team.states.nodes as { id: string; name: string }[]
}

export async function findStateId(teamId: string, name: string): Promise<string | null> {
  const states = await getWorkflowStates(teamId)
  return states.find((s) => s.name.toLowerCase() === name.toLowerCase())?.id || null
}

export async function createProject(input: {
  teamId: string
  name: string
  description?: string
  color?: string
}) {
  const data = await gql(
    `mutation CreateProject($input: ProjectCreateInput!) {
      projectCreate(input: $input) { success project { id url name } }
    }`,
    { input }
  ) as { projectCreate: { project: { id: string; url: string; name: string } } }
  return data.projectCreate.project as { id: string; url: string; name: string }
}

export async function createCycle(input: {
  teamId: string
  name: string
  startsAt: string
  endsAt: string
  description?: string
}) {
  const data = await gql(
    `mutation CreateCycle($input: CycleCreateInput!) {
      cycleCreate(input: $input) { success cycle { id number } }
    }`,
    { input }
  ) as { cycleCreate: { cycle: { id: string; number: number } } }
  return data.cycleCreate.cycle as { id: string; number: number }
}

export async function createIssue(input: {
  teamId: string
  title: string
  description?: string
  priority?: number
  estimate?: number
  labelIds?: string[]
  projectId?: string
  cycleId?: string
  stateId?: string
}) {
  const data = await gql(
    `mutation CreateIssue($input: IssueCreateInput!) {
      issueCreate(input: $input) { success issue { id identifier url title } }
    }`,
    { input }
  ) as { issueCreate: { issue: { id: string; identifier: string; url: string; title: string } } }
  return data.issueCreate.issue as { id: string; identifier: string; url: string; title: string }
}

export async function updateIssueState(issueId: string, stateId: string) {
  await gql(
    `mutation UpdateIssue($id: String!, $stateId: String!) {
      issueUpdate(id: $id, input: { stateId: $stateId }) { success }
    }`,
    { id: issueId, stateId }
  )
}

export async function addComment(issueId: string, body: string) {
  await gql(
    `mutation AddComment($issueId: String!, $body: String!) {
      commentCreate(input: { issueId: $issueId, body: $body }) { success }
    }`,
    { issueId, body }
  )
}

export async function updateIssue(
  issueId: string,
  opts: { statusName?: string; teamId?: string; comment?: string }
) {
  if (opts.statusName && opts.teamId) {
    const stateId = await findStateId(opts.teamId, opts.statusName)
    if (stateId) await updateIssueState(issueId, stateId)
  }
  if (opts.comment) await addComment(issueId, opts.comment)
}

export interface LinearIssueRecord {
  id: string
  identifier: string
  title: string
  description: string | null
  teamId: string
  state: { name: string }
  priority: number
  labels: string[]  // label names
}

/** Fetch label names for a single issue */
export async function getIssueLabels(issueId: string): Promise<string[]> {
  const data = await gql(`
    query { issue(id: "${issueId}") { labels { nodes { name } } } }
  `) as { issue: { labels: { nodes: { name: string }[] } } }
  return data.issue.labels.nodes.map((l: { name: string }) => l.name)
}

/**
 * List issues in a team, optionally filtered by cycle and/or state name.
 * Returns issues ordered by priority.
 */
export async function listIssues(opts: {
  teamId: string
  cycleId?: string
  stateName?: string
}): Promise<LinearIssueRecord[]> {
  // When cycleId is given, query via cycle node (issue filter doesn't support cycle reliably)
  if (opts.cycleId) {
    const stateFilter = opts.stateName
      ? `filter: { state: { name: { eq: "${opts.stateName}" } } },`
      : ''
    const data = await gql(`
      query ListCycleIssues {
        cycle(id: "${opts.cycleId}") {
          issues(${stateFilter} first: 50) {
            nodes {
              id identifier title description
              team { id }
              state { name }
              priority
              labels { nodes { name } }
            }
          }
        }
      }
    `) as {
      cycle: {
        issues: {
          nodes: Array<{
            id: string
            identifier: string
            title: string
            description?: string | null
            team: { id: string }
            state: { name: string }
            priority: number
            labels: { nodes: { name: string }[] }
          }>
        }
      }
    }
    return data.cycle.issues.nodes.map((n) => ({
      id: n.id, identifier: n.identifier, title: n.title,
      description: n.description || null,
      teamId: n.team.id, state: n.state, priority: n.priority,
      labels: n.labels.nodes.map((l) => l.name),
    }))
  }

  // No cycleId — filter by team and optionally state
  const filters: string[] = [`team: { id: { eq: "${opts.teamId}" } }`]
  if (opts.stateName) filters.push(`state: { name: { eq: "${opts.stateName}" } }`)

  const data = await gql(`
    query ListIssues {
      issues(filter: { ${filters.join(', ')} }, first: 50) {
        nodes {
          id identifier title description
          team { id }
          state { name }
          priority
          labels { nodes { name } }
        }
      }
    }
  `) as {
    issues: {
      nodes: Array<{
        id: string
        identifier: string
        title: string
        description?: string | null
        team: { id: string }
        state: { name: string }
        priority: number
        labels: { nodes: { name: string }[] }
      }>
    }
  }
  return data.issues.nodes.map((n) => ({
    id: n.id, identifier: n.identifier, title: n.title,
    description: n.description || null,
    teamId: n.team.id, state: n.state, priority: n.priority,
    labels: n.labels.nodes.map((l) => l.name),
  })).sort((a, b) => a.priority - b.priority)
}

/** Fetch a single issue with full details (including estimate) */
export async function getIssue(issueId: string): Promise<LinearIssueRecord & { estimate?: number }> {
  const data = await gql(`
    query {
      issue(id: "${issueId}") {
        id identifier title description
        team { id }
        state { name }
        priority
        estimate
        labels { nodes { name } }
      }
    }
  `) as {
    issue: {
      id: string
      identifier: string
      title: string
      description: string | null
      team: { id: string }
      state: { name: string }
      priority: number
      estimate?: number
      labels: { nodes: { name: string }[] }
    }
  }
  const n = data.issue
  return {
    id: n.id, identifier: n.identifier, title: n.title,
    description: n.description || null,
    teamId: n.team.id, state: n.state, priority: n.priority,
    estimate: n.estimate,
    labels: n.labels.nodes.map((l: { name: string }) => l.name),
  }
}

/** Update issue description and/or estimate */
export async function updateIssueDetails(issueId: string, input: {
  description?: string
  estimate?: number
  labelIds?: string[]
}) {
  await gql(
    `mutation UpdateIssueDetails($id: String!, $input: IssueUpdateInput!) {
      issueUpdate(id: $id, input: $input) { success }
    }`,
    { id: issueId, input }
  )
}

export interface CycleRecord {
  id: string
  number: number
  name: string
  startsAt: string
  endsAt: string
  completedAt?: string | null
}

/** List all cycles (sprints) for a team */
export async function listCycles(teamId: string): Promise<CycleRecord[]> {
  const data = await gql(`
    query {
      team(id: "${teamId}") {
        cycles {
          nodes { id number name startsAt endsAt completedAt }
        }
      }
    }
  `) as { team: { cycles: { nodes: CycleRecord[] } } }
  return data.team.cycles.nodes as CycleRecord[]
}

/** Find an existing label by name or create it */
export async function findOrCreateLabel(teamId: string, name: string, color = '#9ca3af'): Promise<string> {
  const data = await gql(`
    query { team(id: "${teamId}") { labels { nodes { id name } } } }
  `) as { team: { labels: { nodes: { id: string; name: string }[] } } }
  const existing = (data.team.labels.nodes as { id: string; name: string }[])
    .find(l => l.name.toLowerCase() === name.toLowerCase())
  if (existing) return existing.id

  const result = await gql(
    `mutation CreateLabel($input: IssueLabelCreateInput!) {
      issueLabelCreate(input: $input) { success issueLabel { id } }
    }`,
    { input: { teamId, name, color } }
  ) as { issueLabelCreate: { issueLabel: { id: string } } }
  return result.issueLabelCreate.issueLabel.id
}

/** Append a label to an issue (non-destructive) */
export async function addLabelToIssue(issueId: string, labelId: string) {
  const data = await gql(`query { issue(id: "${issueId}") { labels { nodes { id } } } }`) as {
    issue: { labels: { nodes: { id: string }[] } }
  }
  const existingIds = (data.issue.labels.nodes as { id: string }[]).map(l => l.id)
  if (existingIds.includes(labelId)) return
  await gql(
    `mutation UpdateIssueLabels($id: String!, $input: IssueUpdateInput!) {
      issueUpdate(id: $id, input: $input) { success }
    }`,
    { id: issueId, input: { labelIds: [...existingIds, labelId] } }
  )
}
