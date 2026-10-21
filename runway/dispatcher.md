# Runway dispatcher: one tick

This is the prompt of the scheduled task "Runway" on the owner's Mac (every 4 hours, and by hand with "Run now"). One tick starts one autopilot run per registered project. It starts with no memory.

1. Read `/Users/Sang/Workspace/repos/runway-board/projects.json`. Take every entry with `"loop": true`.
2. For each such project, read its `statusIssue` on Linear. `PAUSE` on it means skip the project this tick, without writing anything.
3. For each remaining project, build its autopilot prompt: read `/Users/Sang/Workspace/repos/runway-board/runway/autopilot.md` and replace every placeholder with the entry's values (`name`, `repoPath`, `worktreePath`, `linearProject`, `statusIssue`, `checks` joined one per line, `port`, `minutes`).
4. Pick the model from the work ahead: look at the issue the run will take (the rule of autopilot Step 2) and read its `Role` label. UX research, QA and Dev run on `sonnet`; PM and Design run on `opus`; a project with nothing to pick runs its routine health on `haiku`. Start one session per project with that prompt as the whole brief: a fresh session in the project's `repoPath`, on that model, named "Runway · <name> · <role or routine>". Use the session tool when this session has it; start at most `maxParallel` sessions at once (from `projects.json`, default 2) and the rest after one finishes. If sessions cannot be started from here, run the projects yourself, one after another, following the autopilot prompt for each.
5. Write nothing on Linear yourself; each run reports on its own status issue. End with one line per project: started, skipped (PAUSE), or ran inline.

Never do a project's work in this session when a session for it could be started, never work two projects at once in one session, and never ask the owner anything.
