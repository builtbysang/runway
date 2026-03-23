# Runway

[Tiếng Việt](./README.vi.md)

Runway is a chat-first agent runtime for software teams.

In normal use, you talk to an agent in natural language:

- "Analyze this brief and create issues"
- "Create steering docs for this project"
- "Refine these backlog issues"
- "Generate a status report"
- "Implement BUI-123"

Runway then maps that intent to the right internal workflow. The CLI still exists, but mainly as an operator/debug layer behind the chat workflow.

## What Runway does

Runway is built around three main agent layers:

- `Product Agent`
  - analyzes a brief or feature request
  - prefers Figma when provided
  - creates draft issues in Linear for review
  - does not code

- `PM Agent`
  - turns PRDs into roadmaps using `phase -> release -> sprint -> issue`
  - refines issue quality, estimates, complexity, and workstream
  - generates markdown reports
  - generates steering docs
  - syncs Notion only when explicitly requested

- `Dev Agent`
  - implements approved issues against your local repo
  - uses a local authenticated CLI backend: `codex` or `claude`
  - opens GitHub PRs
  - updates Linear back to `In Review`

Support workflows:

- `write-report` writes status snapshots to `.md`
- `write-steering` creates steering docs
- `sprint-review` creates retrospectives and optional carry-over issues
- `projects` manages the local project registry

## How to use Runway

The primary interface is chat.

Typical chat requests:

- "Turn this brief into Linear issues"
- "Use this Figma and prepare the implementation issues"
- "Generate steering docs for wealth-next"
- "Write the current project report to markdown"
- "Implement issue BUI-123"

The command layer is mainly useful for:

- operator control
- local debugging
- scripted runs
- fallback when you want exact manual execution

## Workflow

Runway is designed for a review-first execution flow:

1. You provide a brief, feature request, or PRD.
2. `product-intake` or `plan` creates structure in Linear.
3. You review and adjust scope in Linear.
4. You add or update Figma links when needed.
5. `refine` improves issue quality.
6. `write-steering` creates persistent project guidance in `.runway/steering/`.
7. `run` is executed only for the issues you explicitly approve for implementation.

This keeps planning, UX intent, and implementation approval separate.

## Project context

Runway prefers compact, versioned context over heavy documentation systems.

Context priority:

1. `.runway/steering/product.md`
2. `.runway/steering/structure.md`
3. `.runway/steering/tech.md`
4. `.runway/steering/02-ux-rules.md`
5. `.runway/steering/03-visual-rules.md`
6. `.runway/steering/04-design-system.md`
7. optional Notion context page

The goal is to keep agents grounded with high-signal project rules without wasting tokens.

## Repo structure

```text
agents/       Agent orchestration logic
commands/     CLI command handlers
skills/       Integrations and model/runtime adapters
lib/          Small shared utilities
scripts/      Helper scripts
docs/         Recommended location for markdown outputs
```

## Requirements

- `Node.js 20.x`
- `pnpm`
- one local authenticated LLM CLI:
  - `codex`
  - or `claude`
- `LINEAR_API_KEY`
- `GITHUB_TOKEN`
- optional `NOTION_TOKEN`

## Install

```bash
git clone https://github.com/builtbysang/runway.git
cd runway
pnpm install
```

## Project configuration

Runway uses `projects.json` as a local registry.

Example:

```json
{
  "wealth-next": {
    "linearTeamId": "your-linear-team-id",
    "githubRepo": "yourorg/your-repo",
    "localRepoPath": "/absolute/path/to/your/local/repo",
    "description": "Vietnamese personal finance app",
    "techStack": "Next.js / TypeScript / Tailwind / Supabase",
    "notionContextPageId": "optional-notion-context-page-id",
    "notionSyncPageId": "optional-notion-sync-page-id"
  }
}
```

Field reference:

- `linearTeamId`: Linear team used for issues, labels, cycles, and projects
- `githubRepo`: GitHub repo in `owner/name` format
- `localRepoPath`: absolute path to the local codebase Runway should use for implementation and steering docs
- `description`: human-readable project label
- `techStack`: short context string passed into the agents
- `notionContextPageId`: optional read-only context source
- `notionSyncPageId`: optional Notion status output target

## Environment

Create `.env.local`:

```bash
LINEAR_API_KEY=lin_api_...
GITHUB_TOKEN=ghp_...
NOTION_TOKEN=secret_... # optional
```

Notes:

- Keep `LINEAR_API_KEY`, `GITHUB_TOKEN`, and `NOTION_TOKEN` here once.
- Switch between Codex and Claude with pnpm scripts instead of editing env every time.
- `GITHUB_TOKEN` should have enough access to create branches and PRs.
- `NOTION_TOKEN` is optional and only needed for Notion context or manual sync.

## Using Codex or Claude

The intended experience is still chat-first.

You talk to Codex or Claude, and the agent decides when to call Runway's internal workflows.

Use direct CLI commands only when you want precise operator control.
The local CLI you already have logged in is what Runway uses under the hood.

For Codex:

```bash
pnpm dev:codex -- doctor
pnpm dev:codex -- product-intake --project your-project --brief-file ./docs/brief.md
```

For Claude:

```bash
pnpm dev:claude -- doctor
pnpm dev:claude -- run --project your-project --issues BUI-123
```

If Claude fails with a `401`, refresh the local session with:

```bash
claude auth login
```

## Steering docs

Runway supports steering docs in the target repo:

```text
.runway/steering/product.md
.runway/steering/structure.md
.runway/steering/tech.md
.runway/steering/02-ux-rules.md
.runway/steering/03-visual-rules.md
.runway/steering/04-design-system.md
```

Generate them with:

```bash
pnpm dev -- write-steering \
  --project your-project \
  --context-file ./docs/prd.md
```

Or inline:

```bash
pnpm dev -- write-steering \
  --project your-project \
  --context "Project context here"
```

Use steering docs for:

- product direction
- repo/module boundaries
- engineering constraints and conventions
- UX principles, flows, hierarchy, writing, and behavior
- visual style, color direction, mood, and art direction
- design tokens, components, patterns, states, and layout rules

## Reports

Markdown is the default output format.

Write a project report:

```bash
pnpm dev -- write-report --project your-project
```

Write a sprint report:

```bash
pnpm dev -- write-report \
  --project your-project \
  --cycle sprint-id \
  --output docs/reports/sprint-12.md
```

Default output paths:

```text
docs/reports/<project>.md
docs/reports/<project>-<cycleId>.md
```

Use `sync-notion` only when you explicitly want the same information pushed to Notion.

## Operator commands

### `doctor`

Check whether the current environment is ready to run Runway.

```bash
pnpm dev -- doctor
pnpm dev:codex -- doctor
pnpm dev:claude -- doctor
```

### `product-intake`

Analyze a brief and create review-ready issues in Linear.

```bash
pnpm dev -- product-intake \
  --project your-project \
  --brief-file ./docs/brief.md
```

With Figma:

```bash
pnpm dev -- product-intake \
  --project your-project \
  --brief-file ./docs/brief.md \
  --figma-url https://www.figma.com/design/...
```

### `plan`

Turn a PRD into a roadmap.

```bash
pnpm dev -- plan \
  --project your-project \
  --prd-file ./docs/prd.md
```

### `refine`

Upgrade issue quality and metadata.

```bash
pnpm dev -- refine --project your-project
```

Or refine specific issues:

```bash
pnpm dev -- refine \
  --project your-project \
  --issues BUI-123,BUI-124
```

### `run`

Implement approved issues.

```bash
pnpm dev -- run \
  --project your-project \
  --issues BUI-123
```

### `report`

Return a markdown report as JSON.

```bash
pnpm dev -- report --project your-project
```

### `write-report`

Write the markdown report to disk.

```bash
pnpm dev -- write-report --project your-project
```

### `write-steering`

Write steering docs to `.runway/steering/` in the target repo.

```bash
pnpm dev -- write-steering \
  --project your-project \
  --context-file ./docs/prd.md
```

### `sync-notion`

Write a status snapshot to Notion.

```bash
pnpm dev -- sync-notion --project your-project
```

### `sprint-review`

Generate a sprint retrospective and optional carry-over issues.

```bash
pnpm dev -- sprint-review \
  --project your-project \
  --cycle sprint-id \
  --next-cycle next-sprint-id
```

### `projects list`

```bash
pnpm dev -- projects list
```

### `projects add`

```bash
pnpm dev -- projects add \
  --key your-project \
  --team-id your-linear-team-id \
  --repo yourorg/your-repo \
  --local-repo-path /absolute/path/to/repo \
  --description "What this project does" \
  --tech-stack "TypeScript / Node.js"
```

## Helper script

```bash
./scripts/run-sprint.sh --project your-project --cycle sprint-id
```

## License

No license file is included yet. Add one before treating this repo as open-source licensed software.
