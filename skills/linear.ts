/**
 * Runway — Linear API skill
 * Create projects, cycles, issues; update state; add comments
 */

const LINEAR_API = 'https://api.linear.app/graphql'

async function gql(query: string, variables?: Record<string, unknown>) {
  const res = await fetch(LINEAR_API, {
    method: 'POST',
    headers: {
      Authorization: process.env.LINEAR_API_KEY || '',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors) throw new Error(JSON.stringify(json.errors))
  return json.data
}

export async function getWorkflowStates(teamId: string) {
  const data = await gql(`query { team(id: "${teamId}") { states { nodes { id name } } } }`)
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
  )
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
  )
  return data.cycleCreate.cycle as { id: string; number: number }
}

export async function createIssue(input: {
  teamId: string
  title: string
  description?: string
  priority?: number
  estimate?: number
  projectId?: string
  cycleId?: string
  stateId?: string
}) {
  const data = await gql(
    `mutation CreateIssue($input: IssueCreateInput!) {
      issueCreate(input: $input) { success issue { id identifier url title } }
    }`,
    { input }
  )
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
  `)
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
    `)
    return data.cycle.issues.nodes.map((n: Record<string, unknown> & { team: { id: string }, state: { name: string }, labels: { nodes: { name: string }[] } }) => ({
      id: n.id, identifier: n.identifier, title: n.title,
      description: (n.description as string) || null,
      teamId: (n.team as { id: string }).id, state: n.state, priority: n.priority as number,
      labels: n.labels.nodes.map((l) => l.name),
    }))
  }

  // No cycleId — filter by team and optionally state
  const filters: string[] = [`team: { id: { eq: "${opts.teamId}" } }`]
  if (opts.stateName) filters.push(`state: { name: { eq: "${opts.stateName}" } }`)

  const data = await gql(`
    query ListIssues {
      issues(filter: { ${filters.join(', ')} }, orderBy: priority, first: 50) {
        nodes {
          id identifier title description
          team { id }
          state { name }
          priority
          labels { nodes { name } }
        }
      }
    }
  `)
  return data.issues.nodes.map((n: Record<string, unknown> & { team: { id: string }, state: { name: string }, labels: { nodes: { name: string }[] } }) => ({
    id: n.id, identifier: n.identifier, title: n.title,
    description: (n.description as string) || null,
    teamId: (n.team as { id: string }).id, state: n.state, priority: n.priority as number,
    labels: n.labels.nodes.map((l) => l.name),
  }))
}
