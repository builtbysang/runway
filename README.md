# Runway

Runway is a local-first agent runtime for software projects.

It connects product intake, Linear planning, GitHub implementation, optional Notion sync, and Figma-aware issue drafting in one CLI-first workflow. This repo no longer runs as a webhook-driven web app. There is no automatic "Linear In Progress -> code immediately" behavior in the current version.

## Current workflow

Runway is designed for a review-first flow:

1. You send a feature request or product brief.
2. `product-intake` analyzes the request and creates draft issues in Linear.
3. You review those issues in Linear.
4. If needed, you add or update the Figma link on the issue.
5. `refine` upgrades issue quality and metadata when needed.
6. Only when you explicitly decide to build do you run `run` for the approved issue(s).

In other words:

- Runway does not auto-code right after receiving a request.
- Runway does not auto-trigger from Linear status changes in this version.
- Figma should be treated as the source of truth whenever you provide it.

## Agents and workflows

Runway currently has three main agent layers plus support workflows:

- `Product Agent`
  - analyzes a request
  - prefers Figma if provided
  - creates small, review-ready draft issues in Linear
  - does not code

- `PM Agent`
  - `plan`: turns a PRD into a roadmap using `phase -> release -> sprint -> issue`
  - `refine`: upgrades issue descriptions, estimates, complexity, and workstream
  - `report`: generates a markdown progress report from Linear
  - `syncNotion`: writes a status snapshot into Notion when you explicitly run it

- `Dev Agent`
  - implements approved issues
  - reads the target GitHub repo through the GitHub API
  - can fetch brand SVGs from theSVG when needed
  - opens a PR and moves the issue to `In Review`

Support workflows:

- `sprint-review`: retrospective plus optional carry-over issues
- `projects`: manage the local `projects.json` registry

## Why it is CLI-first

The product logic in this repo lives in:

- `agents/`
- `commands/`
- `skills/`

The old `Next.js` and webhook layer has been removed. The current architecture is intentionally lightweight and explicit: you run the commands you want, when you want them to happen.

## Requirements

- `Node.js 20.x`
- `npm`
- LLM API access via `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`
- Linear API access via `LINEAR_API_KEY`
- GitHub API access via `GITHUB_TOKEN`
- Optional Notion API access via `NOTION_TOKEN`

## Install

```bash
git clone https://github.com/builtbysang/runway.git
cd runway
npm install
```

## Configure projects

Runway uses `projects.json` as a local registry for the projects it can operate on.

Example:

```json
{
  "your-project": {
    "linearTeamId": "your-linear-team-id",
    "githubRepo": "yourorg/your-repo",
    "description": "What this project does",
    "techStack": "TypeScript / Node.js",
    "notionContextPageId": "optional-notion-context-page-id",
    "notionSyncPageId": "optional-notion-status-page-id"
  }
}
```

Field reference:

- `linearTeamId`: Linear team ID used for issues, cycles, labels, and projects
- `githubRepo`: GitHub repo in `owner/name` format
- `description`: human-readable project label used in reports
- `techStack`: short context string passed into the LLM
- `notionContextPageId`: optional Notion page ID used for compressed read-only project context
- `notionSyncPageId`: optional Notion page ID used for explicit status sync output

## Environment variables

Create `.env.local`:

```bash
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-... # optional if using OpenAI / Codex
RUNWAY_LLM_PROVIDER=anthropic # or openai
RUNWAY_OPENAI_DEV_MODEL_SIMPLE=gpt-5.1-codex-mini
RUNWAY_OPENAI_DEV_MODEL_NORMAL=gpt-5.1-codex-mini
RUNWAY_OPENAI_DEV_MODEL_COMPLEX=gpt-5.1-codex
RUNWAY_OPENAI_TEXT_MODEL=gpt-5-mini
LINEAR_API_KEY=lin_api_...
GITHUB_TOKEN=ghp_...
NOTION_TOKEN=secret_... # optional
```

Notes:

- Set either `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`.
- `RUNWAY_LLM_PROVIDER` lets you force `anthropic` or `openai`.
- `GITHUB_TOKEN` needs write access if you want Runway to open PRs.
- `LINEAR_API_KEY` should be able to read and write issues, comments, labels, cycles, and projects.
- `NOTION_TOKEN` is optional. If it is missing, Runway skips Notion context enrichment and Notion sync.

## Development commands

During development:

```bash
npm run dev -- <command>
```

After compiling:

```bash
npm run build
npm start -- <command>
```

Quick sanity checks:

```bash
npm run check
npm run build
npm run dev -- help
```

## Command reference

### `product-intake`

Analyze a feature request and create draft issues in Linear for human review.

From a file:

```bash
npm run dev -- product-intake \
  --project your-project \
  --brief-file ./docs/brief.md
```

With Figma:

```bash
npm run dev -- product-intake \
  --project your-project \
  --brief-file ./docs/brief.md \
  --figma-url https://www.figma.com/design/...
```

Use this when you want:

- feature analysis before coding
- UX/product framing before planning
- draft issues on Linear that you can review manually

This command does not code anything.

### `plan`

Turn a PRD into a roadmap using `phase -> release -> sprint -> issue`.

From a file:

```bash
npm run dev -- plan \
  --project your-project \
  --prd-file ./docs/prd.md
```

Inline:

```bash
npm run dev -- plan \
  --project your-project \
  --prd "Build a personal finance app for couples."
```

Returns JSON with:

- `projectUrl`
- `issueCount`
- `summary`

### `refine`

Enrich existing Linear issues using repo context plus PM logic.

```bash
npm run dev -- refine \
  --project your-project \
  --state Backlog \
  --limit 10
```

Or refine specific issues:

```bash
npm run dev -- refine \
  --project your-project \
  --issues BUI-55,BUI-56
```

Effects:

- upgrades issue descriptions into a standard template
- writes story point estimates
- adds complexity labels
- assigns workstream labels: `frontend`, `backend`, or `fullstack`

### `run`

Run the Dev Agent only for issues you want to build now.

Explicit issues:

```bash
npm run dev -- run \
  --project your-project \
  --issues BUI-32,BUI-33
```

By state:

```bash
npm run dev -- run \
  --project your-project \
  --state Todo
```

By cycle:

```bash
npm run dev -- run \
  --project your-project \
  --cycle 234464c2-fba4-47a5-872f-7c342a7c8287
```

Important:

- this is a manual execution step
- it is not auto-triggered by Linear state changes in this version

### `report`

Generate a markdown progress report from Linear data.

Whole project:

```bash
npm run dev -- report --project your-project
```

Single sprint:

```bash
npm run dev -- report \
  --project your-project \
  --cycle sprint-id
```

Returns JSON with:

- `stats`
- `report`

The `report` field is ready to paste into Notion, Slack, or a PR.

### `sync-notion`

Write a status snapshot into Notion when you explicitly want it.

```bash
npm run dev -- sync-notion --project your-project
```

Or target a specific page:

```bash
npm run dev -- sync-notion \
  --project your-project \
  --page-id your-notion-page-id
```

This command is manual by design so you do not spend tokens syncing Notion continuously.

### `sprint-review`

Generate a sprint retrospective and optionally create carry-over issues.

```bash
npm run dev -- sprint-review \
  --project your-project \
  --cycle sprint-id \
  --next-cycle next-sprint-id
```

### `projects list`

List the current `projects.json` registry.

```bash
npm run dev -- projects list
```

### `projects add`

Add a new project entry to `projects.json`.

```bash
npm run dev -- projects add \
  --key your-project \
  --team-id your-linear-team-id \
  --repo yourorg/your-repo \
  --description "What this project does" \
  --tech-stack "TypeScript / Node.js" \
  --notion-page-id optional-notion-context-page-id \
  --notion-sync-page-id optional-notion-status-page-id
```

## Helper script

There is also a thin wrapper script:

```bash
./scripts/run-sprint.sh --project your-project --cycle sprint-id
```

It simply forwards arguments to:

```bash
npm run dev -- run ...
```

## Repo layout

```text
agents/       Agent orchestration logic
commands/     CLI command handlers
lib/          Shared config and argument parsing helpers
skills/       Integrations for LLMs, GitHub, Linear, Notion, and theSVG
scripts/      Small shell wrappers around the CLI
projects.json Local project registry
cli.ts        Main entrypoint
```

## Current limitations

- Runway is local-first. There is no built-in HTTP server or webhook listener in this version.
- The Dev Agent works against GitHub-hosted repos through the GitHub API, not your local filesystem checkout.
- `run` is manual. Moving a Linear issue to `In Progress` does not auto-execute code.
- Phase structure exists in the roadmap schema and generated Linear descriptions, but Linear itself is still modeled mainly through projects, cycles, and issues.
- There is no built-in reviewer or QA agent yet.

## Suggested next steps

If you want to extend Runway next, the highest-leverage additions are:

- `Reviewer Agent` to review generated diffs before PR handoff
- `QA Agent` to run tests/build checks before PR creation
- stricter approval gates before `run`
- a tiny webhook adapter only if you explicitly want automation again
