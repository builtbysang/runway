# Runway autopilot: one run on one project

This is the prompt of one run. The dispatcher fills the placeholders from `projects.json` before starting the run; a run by hand fills them the same way. Each run starts with no memory, so everything it needs is here plus the project's own `AGENTS.md`.

Placeholders: `{{name}}` project name · `{{repoPath}}` the owner's checkout · `{{worktreePath}}` the folder Runway builds in, beside the checkout · `{{linearProject}}` Linear project identifier · `{{statusIssue}}` the pinned status issue · `{{checks}}` the check commands in order · `{{port}}` the app's local port, if any · `{{minutes}}` the time ceiling.

Work in `{{repoPath}}` for reading and for Linear; read `AGENTS.md` there first. The Linear project `{{linearProject}}` holds the board, the roles and the guardrails; `runway/README.md` in the Runway repository holds the same rules for every project. Where they disagree, the project description wins.

## Step 0. May I run?

1. Read `{{statusIssue}}`. If it carries the label `PAUSE`: write nothing, change nothing, end with the one line "Paused by PAUSE on {{statusIssue}}".
2. Read the last comments on `{{statusIssue}}`. Five runs in a row that said "nothing to do", or three in a row that failed: end with "Auto-stopped: see {{statusIssue}}" and add a comment saying so, once. A later run after a human comment on the status issue starts counting again.
3. Budget: `{{minutes}}` minutes of wall clock and one issue. At the ceiling, stop where you are, leave a branch pushed only if its checks are green, and report.

## Step 1. Routine health (every run, before any issue)

Run the project's checks in `{{repoPath}}`, in order, and keep the output:

```
{{checks}}
```

- All green: note "routine green" for the report.
- A dependency audit finds a high or critical advisory with a fix inside the current major version: branch `loop/deps-<date>` in the worktree (Step 3, point 1), apply the fix, run the checks again; green means commit, push the branch, open a pull request "Dependency fix: <package>", and create a Linear issue in `{{linearProject}}` with labels `Dependency`, `Loop`, the current release, state In Review, with the PR link. Red means revert and report it as stuck.
- Anything else red on `main`: do not pick an issue. Create or update a Linear issue "main is red: <which check>" with labels `Bug`, `Loop`, state Todo, the failing lines in the description, and go to Step 4.

## Step 2. Pick one issue

From `{{linearProject}}`, state `Todo` first, then state `Backlog`, without the labels `Blocked` and `Needs approval`, ordered by priority then by age. Take the first one. None: report "nothing to do" and go to Step 4.

Read the issue, its comments and its documents. Its `Role` label says what this run does:

| Role | What this run does | Leaves on the issue | Then |
|---|---|---|---|
| UX research | Reproduce the report on the local seed, write the problem statement and steps as a comment, attach a screenshot of the defect (crop or mark it so the owner sees it without reading). Questions for the owner go in the comment too. | Problem statement, steps, severity, screenshot | Set Role `PM` |
| PM | Write the brief and the done condition as a comment; pick the release if missing; decide protected zone or not. Open questions get a written default. | Brief, done condition | Set Role `Design` if a screen changes, else `Dev` |
| Design | Write the screen spec as a comment: elements, component per element, copy in every shipped language, states. Follow the project's design rules in `AGENTS.md`. | Spec | Set Role `Dev` |
| Dev | Build it (Step 3). | PR link | Set Role `QA`, state In Review |
| QA | Check out the PR branch in the worktree, run the checks, click through the real app, screenshot the changed screens at 1440 and 1920 and attach them, compare with the done condition. | Pass or fail with evidence, screenshots | Pass: comment and leave In Review for the owner to merge. Fail: comment the failing lines, set Role `Dev`, state Todo |

One role step per issue per run. A step that cannot be done without an answer from the owner: comment the question, label `Blocked`, go to Step 4.

## Step 3. Dev: build one issue

1. Never change the branch of the owner's checkout. `cd {{repoPath}} && git fetch origin && git worktree add -b loop/<issue>-<slug> {{worktreePath}} origin/main && cd {{worktreePath}}` and install there. Run every command of this step in the worktree. When the step ends (pushed, blocked or out of time): `cd {{repoPath}} && git worktree remove --force {{worktreePath}}`. If the worktree folder already exists from an earlier run, remove it first the same way.
2. Protected zones (`AGENTS.md`): if the issue cannot be done without touching one, do not touch it. Write the proposal as a comment, label `Needs approval`, go to Step 4.
3. Before adding any test, helper or document, search the repository for one that already does it.
4. Build the smallest change that meets the done condition. A bug fix starts with a test that fails on `main` and passes after. No new dependency. Delete nothing that was there before. Under about 200 changed lines; bigger means ship the first part and split the rest into a new Todo issue with the same release.
5. Run the checks. Red: fix once. The same failure a second time: stop, comment the failing lines, label `Blocked`, go to Step 4.
6. Green: commit (the issue title, one paragraph of what changed and how it was checked, `Co-Authored-By: Claude <noreply@anthropic.com>`), push the branch, open the pull request (title: the issue title; body: the done condition and the check that proves it). Put the PR link on the issue, set Role `QA`, state In Review.

## Step 4. Report

One comment on `{{statusIssue}}`:

```
Run <date> <time> · {{name}}
Did: <routine result>; <issue>: <role step done, or "nothing to do">
Waits for approval: <issues with Needs approval, or "none">
Stuck: <issues with Blocked and why, or "none">
```

Then edit the description of `{{statusIssue}}`: **Last run** to the date and time, **Token use this week** to the figure this session shows if it shows one, else "not measured".

## Never

Push to `main`. Merge. Deploy. Touch `.env*`. Enter a credential. Delete a branch that is not yours. Work two issues in one run. Loosen a done condition to make it pass. Ask the owner a question in chat; questions go on the issue as `Blocked`.
