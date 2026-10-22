# Runway: the self-running loop for any project

Runway keeps a software project healthy and moves its backlog forward without the owner driving it issue by issue. The owner reports pain points and gives direction now and then; Runway does the rest and reports once per run. It is a process plus two prompts plus one scheduled task, and it applies to any repository registered in `projects.json`. Pumpkin Art was the first project; nothing here is specific to it.

## The shape

| Piece | Where | What it is |
|---|---|---|
| Registry | `projects.json` | One entry per project: repo path, GitHub repo, Linear project, status issue, checks, loop on or off |
| Dispatcher | `runway/dispatcher.md` | The prompt of the scheduled task "Runway": reads the registry and runs the autopilot once per project, one after another, in that session |
| Autopilot | `runway/autopilot.md` | The prompt of one run on one project: may I run, routine health, one issue, one role step, report |
| Board | Linear, one project per repository | Backlog is the inbox; roles and releases are labels and milestones; the status issue is the dashboard |
| Proof | the repository's CI | Build, lint, tests on every pull request; a change without a check that fails without it is a proposal, not a change |

## The process (what the owner does, what Runway does)

1. **Vision and releases first.** A project starts with a document the owner confirms: the vision in a paragraph, what done looks like, the quarter's goals, and releases R0, R1, R2 with a date and one sentence of what the owner can use when each ships. Work that serves no release waits. The owner reviews the next release's scope once a week.
2. **Audit before build.** A new area starts with three read-only audits: UX (walk every flow on seeded data, count clicks, name what the screen fails to say), UI (every screen at five widths, numbers from the DOM, screenshots attached to the issues), motion (what exists, what each place earns). Findings become issues with a release. Fixes come from the ranked list, never from the latest message.
3. **Roles, one step per run.** Each issue carries a `Role` label: UX research (asks the owner, reproduces, attaches a screenshot), PM (brief, done condition, release, protected zone or not), Design (screen spec), Dev (one issue, one branch, one pull request, about 200 lines), QA (runs the checks, clicks through, screenshots, pass or fail). A run does one role step on one issue and hands it to the next role.
4. **Two tiers of change.** Done on its own: anything with a check that fails without it, dependency and security updates with green tests, bug fixes with a reproducing test. Proposal only (`Needs approval`): protected zones such as sign-in, migrations, deploy, CI config, agent rules.
5. **No questions in this mode.** Where an issue has open questions, Runway writes a default on the issue and builds with it; the owner changes it in the weekly review. Only secrets and owner-only settings are reported as blocked.
6. **Report, do not narrate.** One comment per run on the status issue: did, waits for approval, stuck. The status issue's description holds last run and token use. The owner reads that issue and the `Needs approval` filter, not pull requests.

## Guardrails (every project, every run)

1. Work comes only from the board and the routine list (install, lint, build, tests, dependency and security scan); in hackathon mode also from a fresh audit, filed as issues first. No self-invented features, no drive-by fixes.
2. One issue, one branch, one pull request per role step (hackathon mode chains role steps, each still on its own branch). Never push to `main`, never merge, never deploy, never touch `.env*`, never enter a credential.
3. Reproduce before fixing; cannot reproduce means `Blocked` with a question.
4. Every change ships with a check that fails without it.
5. The same failure twice in a row: stop, comment, `Blocked`.
6. Protected zones are proposal only.
7. No new dependency, no new rule or skill file, delete nothing that was there before.
8. About 200 changed lines per pull request; bigger work is split.
9. Before adding anything, show it does not already exist.
10. A time ceiling per run; at the ceiling, stop and report.
11. `PAUSE` on the status issue stops the project; the owner adds or removes it.
12. Five idle runs or three failed runs in a row: the project auto-stops and says so.
13. Every command runs in a temporary clone of `main`; the owner's checkout is read only and is never changed.

## Cadence modes and what they cost

Each project picks one cadence in `projects.json`: `half-hourly`, `hourly`, `few-a-day` (every 4 hours), `daily`, `4-a-week`, `weekly`, `biweekly` or `hackathon`. The scheduled task fires at the finest cadence in use, and a tick runs only the projects that are due. `hackathon` is the relentless mode: due on every tick, no time limit, and each run works issue after issue until the board is empty or `PAUSE` is set; when the board is empty it re-audits `main` and files what it finds (`minutes` is ignored).

**Warning before switching a project to `hackathon`.** The Mac stays busy around the clock, the model bill runs without a ceiling, pull requests pile up faster than the owner reviews them, and the only brakes are `PAUSE` on the status issue and the auto-stop after five empty runs. Whoever switches a project to this cadence says this to the owner in the same message, and the switch is recorded on the status issue with the date. The cadence also sets the cost: a project on an hourly or half-hourly cadence does its routine health on the cheapest model and its research, QA and build steps on the middle one, and takes judgment steps (PM, Design) once a day; a weekly project may spend the strong model on every step. The table is in `runway/dispatcher.md`.

## What a scheduled run can and cannot do

The scheduled task fires in a session with no project folder. It can read the repositories, Linear and GitHub, run commands in the temp folder, and hand a run to a subagent on a cheaper model; it cannot open other sessions, change its own model, or write under the owner's repository folders. So one tick runs the due projects one after another, each through a subagent on the model its cadence allows (or in the tick itself when a subagent is refused), and the clone in the temp folder is where everything happens. Commands the sandbox refuses (Docker, a browser, the local inbox) run with the sandbox off.

## Preparing a project (R0)

Before the loop is switched on: CI on the project's GitHub Actions with build, lint and a handful of smoke tests; an `AGENTS.md` in the repository root (how to run it, the checks, the protected zones); the three audits; a groomed backlog where every issue has a release. A private git dependency needs a repository secret only the owner can add. Then the registry entry gets `"loop": true` and `PAUSE` comes off the status issue.

## Adding a project

1. Create the Linear project; paste the board, roles and guardrails from this file into its description; create the `Role` label group and the `Loop`, `Needs approval`, `Blocked`, `PAUSE`, `Security`, `Dependency` labels if the workspace lacks them; create the pinned status issue with `PAUSE` on.
2. Write the vision and releases document; the owner confirms it.
3. Add the entry to `projects.json` with its cadence and `"loop": false`.
4. Run R0 by hand or through Runway (the preparation issue, the audits, grooming).
5. Set `"loop": true`, remove `PAUSE`.

## Where this came from

Built on 2026-10-21 and 22 for Pumpkin Art (Linear project "Pumpkin Art loop", `P-BUI-8`), then lifted here on the owner's instruction that it is a process for every project, not one project's tooling. The older Runway Board CLI (`agents/`, `commands/`, `skills/`) is an earlier take on the same idea; the loop layer in `runway/` is the live one.
