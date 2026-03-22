/**
 * Runway — GitHub API skill
 */

const GITHUB_API = 'https://api.github.com'
const MAX_READ_FILE_BYTES = 20_000

interface GitHubContentFile {
  content: string
  sha: string
  size: number
  encoding?: string
}

interface GitHubDirectoryEntry {
  type: string
  name: string
}

interface GitHubRefResponse {
  object: { sha: string }
}

interface GitHubPullRequestResponse {
  html_url: string
  number: number
}

interface GitHubRepositoryResponse {
  default_branch: string
}

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
  const data = await res.json() as GitHubContentFile
  const content = Buffer.from(data.content, 'base64').toString('utf-8')

  if (data.size > MAX_READ_FILE_BYTES) {
    return {
      path,
      content: [
        `File too large to read fully in agent context: ${path}`,
        `Size: ${data.size} bytes`,
        `Preview (first ${MAX_READ_FILE_BYTES} bytes):`,
        content.slice(0, MAX_READ_FILE_BYTES),
      ].join('\n\n'),
      sha: data.sha,
    }
  }

  return {
    path,
    content,
    sha: data.sha,
  }
}

/** List files/folders in a directory — returns "type name" per line */
export async function readDir(repo: string, path: string, token: string): Promise<string[]> {
  const res = await fetch(`${GITHUB_API}/repos/${repo}/contents/${path}`, {
    headers: headers(token),
  })
  if (!res.ok) return []
  const data = await res.json() as GitHubDirectoryEntry[] | GitHubContentFile
  if (!Array.isArray(data)) return []
  return data.map((item) => `${item.type} ${item.name}`)
}

export async function readFiles(repo: string, paths: string[], token: string) {
  const results = await Promise.all(paths.map((p) => readFile(repo, p, token)))
  return results.filter(Boolean) as { path: string; content: string; sha: string }[]
}

async function getMainSHA(repo: string, token: string) {
  const repoRes = await fetch(`${GITHUB_API}/repos/${repo}`, {
    headers: headers(token),
  })
  const repoData = await repoRes.json() as GitHubRepositoryResponse
  const defaultBranch = repoData.default_branch || 'main'

  const res = await fetch(`${GITHUB_API}/repos/${repo}/git/ref/heads/${defaultBranch}`, {
    headers: headers(token),
  })
  const data = await res.json() as GitHubRefResponse
  return data.object.sha
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
  const pr = await res.json() as GitHubPullRequestResponse
  return { url: pr.html_url, number: pr.number }
}
