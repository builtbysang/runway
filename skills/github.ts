/**
 * Runway — GitHub API skill
 */

const GITHUB_API = 'https://api.github.com'

function headers(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
    'User-Agent': 'runway-ai',
  }
}

export async function readFile(repo: string, path: string, token: string) {
  const res = await fetch(`${GITHUB_API}/repos/${repo}/contents/${path}`, {
    headers: headers(token),
  })
  if (!res.ok) return null
  const data = await res.json()
  return {
    path,
    content: Buffer.from(data.content, 'base64').toString('utf-8'),
    sha: data.sha as string,
  }
}

/** List files/folders in a directory — returns "type name" per line */
export async function readDir(repo: string, path: string, token: string): Promise<string[]> {
  const res = await fetch(`${GITHUB_API}/repos/${repo}/contents/${path}`, {
    headers: headers(token),
  })
  if (!res.ok) return []
  const data = await res.json()
  if (!Array.isArray(data)) return []
  return data.map((item: { type: string; name: string }) => `${item.type} ${item.name}`)
}

export async function readFiles(repo: string, paths: string[], token: string) {
  const results = await Promise.all(paths.map((p) => readFile(repo, p, token)))
  return results.filter(Boolean) as { path: string; content: string; sha: string }[]
}

async function getMainSHA(repo: string, token: string) {
  const res = await fetch(`${GITHUB_API}/repos/${repo}/git/ref/heads/main`, {
    headers: headers(token),
  })
  const data = await res.json()
  return data.object.sha as string
}

async function createBranch(repo: string, branchName: string, token: string) {
  const sha = await getMainSHA(repo, token)
  await fetch(`${GITHUB_API}/repos/${repo}/git/refs`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha }),
  })
}

async function commitFile(
  repo: string,
  branch: string,
  file: { path: string; content: string },
  message: string,
  token: string
) {
  const existing = await readFile(repo, file.path, token)
  const body: Record<string, unknown> = {
    message,
    content: Buffer.from(file.content).toString('base64'),
    branch,
  }
  if (existing) body.sha = existing.sha
  await fetch(`${GITHUB_API}/repos/${repo}/contents/${file.path}`, {
    method: 'PUT',
    headers: headers(token),
    body: JSON.stringify(body),
  })
}

export async function createBranchAndPR(opts: {
  repo: string
  branchName: string
  changes: { path: string; content: string }[]
  commitMessage: string
  prTitle: string
  prBody: string
  token: string
}) {
  await createBranch(opts.repo, opts.branchName, opts.token)
  for (const file of opts.changes) {
    await commitFile(opts.repo, opts.branchName, file, opts.commitMessage, opts.token)
  }
  const res = await fetch(`${GITHUB_API}/repos/${opts.repo}/pulls`, {
    method: 'POST',
    headers: headers(opts.token),
    body: JSON.stringify({
      title: opts.prTitle,
      body: opts.prBody,
      head: opts.branchName,
      base: 'main',
    }),
  })
  const pr = await res.json()
  return { url: pr.html_url as string, number: pr.number as number }
}
