# Runway Agent Rules

Runway is a CLI-first TypeScript runtime. Treat it as an automation service, not a web app.

## Repo shape

- `agents/` contains orchestration logic.
- `commands/` contains user-facing command handlers.
- `skills/` contains external service integrations.
- `lib/` contains lightweight shared helpers.

## Working rules

- Keep business logic out of `cli.ts`; put it in `commands/`, `agents/`, or `skills/`.
- Prefer framework-free TypeScript and Node standard library utilities.
- Keep commands composable so a future webhook or scheduler can call the same handlers.
- Avoid reintroducing a full app framework unless there is a real product need for one.
- Do not hardcode secrets, repo paths, cycle IDs, or environment-specific values in scripts.
