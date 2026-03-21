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
