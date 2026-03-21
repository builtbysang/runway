# Runway

**AI automation layer for software projects.** Drag a Linear issue to "In Progress" → Claude reads the codebase, implements it, and opens a pull request. No manual prompting required.

Built on: Next.js · Claude claude-opus-4-6 (adaptive thinking) · Linear · GitHub

---

## What it does

Runway runs as a standalone service between your project management and your codebase. It has two agents:

### Dev Agent
Triggered automatically when a Linear issue is moved to **"In Progress"**.

```
Linear "In Progress" → webhook → Claude reads files → implements → GitHub PR → Linear "In Review"
```

1. Receives Linear webhook
2. Reads relevant source files from GitHub
3. Calls Claude to implement the issue
4. Creates a branch + commits changes + opens a PR
5. Updates the Linear issue to "In Review" with a PR link and summary

### PM Agent
Called via API with a PRD text → creates a full Linear roadmap.

```
PRD text → Claude analyzes → Linear projects + sprints + issues created
```

1. Takes a Product Requirements Document (PRD) as input
2. Claude breaks it into releases, sprints, and individual issues
3. Creates Linear projects, cycles (sprints), and issues with priorities and estimates

---

## Use cases

- **Automate small-to-medium tickets** — bug fixes, UI tweaks, CRUD features, component additions
- **Spin up a roadmap from a PRD** — paste a PRD, get a fully structured Linear roadmap in seconds
- **Reuse across multiple projects** — one Runway deployment serves all your projects via `projects.json`

---

## Setup

### 1. Clone & install

```bash
git clone https://github.com/builtbysang/runway.git
cd runway
npm install
```

### 2. Configure your project

Edit `projects.json` to add your project:

```json
{
  "your-project": {
    "linearTeamId": "your-linear-team-id",
    "githubRepo": "yourorg/your-repo",
    "description": "What this project does",
    "techStack": "Next.js / TypeScript / Tailwind CSS"
  }
}
```

To find your Linear team ID: Linear → Settings → API → copy the team ID.

### 3. Set environment variables

```bash
# Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# Linear
LINEAR_API_KEY=lin_api_...
LINEAR_WEBHOOK_SECRET=lin_wh_...

# GitHub
GITHUB_TOKEN=ghp_...
```

### 4. Deploy to Vercel

```bash
vercel deploy --prod
```

Add env vars in Vercel dashboard under Settings → Environment Variables.

### 5. Create the Linear webhook

1. Go to Linear → **Settings → API → Webhooks → New Webhook**
2. URL: `https://your-runway-url.vercel.app/api/webhook`
3. Events: check **Issues**
4. Copy the signing secret → set as `LINEAR_WEBHOOK_SECRET`

---

## API

### `POST /api/webhook`
Receives Linear webhooks. Fires the Dev Agent when an issue transitions to "In Progress".

Auto-triggered by Linear — no manual calls needed.

---

### `POST /api/plan`
Run the PM Agent to create a Linear roadmap from a PRD.

```bash
curl -X POST https://your-runway-url.vercel.app/api/plan \
  -H "Content-Type: application/json" \
  -d '{
    "projectKey": "your-project",
    "prd": "We are building a personal finance app that helps users track..."
  }'
```

Response:
```json
{
  "ok": true,
  "projectUrl": "https://linear.app/team/project/...",
  "issueCount": 24,
  "summary": "Created 3 releases with 24 issues for Personal Finance App"
}
```

---

### `GET /api/projects`
List all configured projects.

### `POST /api/projects`
Add a new project config at runtime.

```bash
curl -X POST https://your-runway-url.vercel.app/api/projects \
  -H "Content-Type: application/json" \
  -d '{
    "key": "new-project",
    "linearTeamId": "abc-123",
    "githubRepo": "yourorg/new-project",
    "description": "New project description"
  }'
```

---

## Architecture

```
app/
  api/
    webhook/     # Linear webhook handler → Dev Agent
    plan/        # PM Agent endpoint
    projects/    # Project config management

agents/
  dev-agent.ts  # Issue → files → Claude → PR → Linear update
  pm-agent.ts   # PRD → Claude → Linear roadmap

skills/
  claude.ts     # analyzePRD(), implementIssue(), draftDocument()
  github.ts     # readFile(), readFiles(), createBranchAndPR()
  linear.ts     # createProject(), createIssue(), updateIssue(), addComment()

projects.json   # Multi-project config
vercel.json     # 300s timeout for AI functions
```

---

## Adding a new project

1. Add an entry to `projects.json`
2. Create a webhook in that project's Linear team pointing to the same Runway URL
3. Done — Runway will automatically route issues to the correct repo

---

## How the Dev Agent picks files

Runway analyzes the issue title and description to decide which files to read before calling Claude. It always reads `app/page.tsx` and `package.json`, then adds relevant files based on keywords (e.g. "nav" → reads nav component, "invest" → reads investment page).

You can extend `resolveFilePaths()` in `agents/dev-agent.ts` to match your project structure.

---

## Limits

- **Vercel Hobby plan:** Max 300s per function execution (set in `vercel.json`)
- **Complex issues:** Claude works best on well-described, self-contained tickets. Vague tickets get a comment explaining what's missing.
- **Large files:** If a file is very large, Claude may not have full context — keep descriptions specific

---

## License

MIT
