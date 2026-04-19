---
name: runway-orchestrator
description: Use when coordinating multiple development streams, dispatching agents for independent tasks, resuming a multi-agent workflow, or checking stream status via handover files
---

# Runway Orchestrator

## Overview

Orchestrator coordinates parallel streams. **Never writes code** — only plans, dispatches, reviews, logs.

## When to Use

- Starting or resuming multi-stream development
- Dispatching agents for independent tasks (UI / Canvas / Logic)
- Checking status of in-progress streams
- Reviewing agent output and planning next step

## Orchestrator Role

```
Read handover → Dispatch agent → Review diff → Update log → Plan next
```

- Read `Steering/handover/<stream>.md` FIRST before any action
- After agent finishes: review diff → update handover → plan next step
- Never write implementation code — dispatch agents for that

## Stream Conventions

| Stream | Scope |
|--------|-------|
| A | UI only |
| B | Canvas |
| C | Logic / API / tests |

Streams never touch each other's files. For branch isolation, use `superpowers:using-git-worktrees`.

## Step 0 (mandatory for every agent prompt)

Every agent prompt starts with:
```
cat Steering/handover/<stream>.md 2>/dev/null || echo "FRESH START"
```

## Agent Prompt Style

- Complete but no filler — every sentence carries info the agent needs
- Include: goal, relevant file paths, exact steps, expected output, edge cases
- Skip: greetings, "you will now...", restating what was said, vague encouragement
- If token limit near: write handover FIRST then stop
- Use `spawn_task` for out-of-scope tasks; use Agent tool for in-session dispatch

## Handover Log Format

`Steering/handover/<stream>.md` — overwrite after every task:

```
branch: <name>
status: IN_PROGRESS | DONE | BLOCKED

Checklist:
[x] Task A
[~] Task B ← current
[ ] Task C

Last done: <file changed, what>
Next: <exact next step>
Blockers: <if any>
```

## Integration

| Need | Use |
|------|-----|
| Parallel independent tasks | `superpowers:dispatching-parallel-agents` |
| Sequential tasks with review | `superpowers:subagent-driven-development` |
| Branch isolation | `superpowers:using-git-worktrees` |
| Out-of-scope side task | `spawn_task` tool |
