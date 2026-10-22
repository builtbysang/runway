# Runway dispatcher: one tick

This is the prompt of the scheduled task "Runway" on the owner's Mac. The task fires at the finest cadence any registered project uses (hourly today); a tick runs only the projects whose own cadence is due, one after another. It starts with no memory and no project folder: it cannot open other sessions, cannot change its own model, and cannot write under the owner's repository folders, so every run works in a temporary clone as `autopilot.md` says.

## 1. Which projects are due

Read `/Users/Sang/Workspace/repos/runway-board/projects.json`. For every entry with `"loop": true`, in file order:

1. Read its `statusIssue` on Linear. `PAUSE` on it means skip the project, writing nothing. A project without `linearProject` is routine only: it has no board, so skip this read and take its last-run time from `/tmp/claude/runway/last-run.json` instead (create the file when missing; write the project's time there when its run ends).
2. Take the **Last run** date and time from the status issue's description. The project is due when that time is older than its `cadence` interval (the `_runway.cadences` table), or when there is no last run. Not due means skip it silently. Cadence `hackathon` is always due and has no time limit: the project runs every tick, and each run keeps working issue after issue until the board is empty or `PAUSE` is set. A hackathon run that is still going writes **Running since** in the status issue's description; when that line is there and younger than 6 hours, skip the project this tick so two runs never overlap (older than 6 hours means the run died: ignore the line and start).

## 2. Cost follows cadence

A project that runs often must run cheap; a project that runs weekly can afford judgment. The cadence sets two things: the model the work goes to, and which role steps a tick may take.

| Cadence | Routine health (Step 1) | UX research, QA, Dev steps | PM, Design steps |
|---|---|---|---|
| half-hourly, hourly, few-a-day | haiku | sonnet | only on the first due tick after 09:00 local, on opus; other ticks skip issues with those roles |
| daily, 4-a-week, hackathon | haiku | sonnet | opus |
| weekly, biweekly | haiku | opus | opus |

How to run on that model: hand the whole autopilot prompt (placeholders filled) to an `Agent` on the model of the step the run will take, as one brief, and wait for its result. The step is known after reading the issue the run will pick (autopilot Step 2 rule), so read that first; a tick with nothing to pick, and every routine-only project, runs the routine on haiku. If an `Agent` cannot be started or is refused, run the autopilot in this session instead and write "ran on the tick's own model" in the run comment, so the owner sees the cost.

## 3. Run

For each due project: read `/Users/Sang/Workspace/repos/runway-board/runway/autopilot.md`, replace every placeholder with the entry's values (`name`, `repoPath`, `githubRepo`, `linearProject`, `statusIssue`, `checks` one per line, `port`, `minutes`, `cadence`), and have it followed from Step 0 to Step 4 before starting the next project.

End with one line per project: ran (on which model), skipped (PAUSE or not due), or stopped at which step and why.

Never work two projects at once, never write on Linear outside what the autopilot says, and never ask the owner anything.
