# Runway ✈️

AI-powered PM + Dev automation. Deploy once, use for every project.

## What it does

| Agent | Trigger | Output |
|-------|---------|--------|
| **PM Agent** | POST a PRD | Linear project + sprints + issues |
| **Dev Agent** | Linear issue → "In Progress" | GitHub PR + Linear → "In Review" |

## API

- `POST /api/plan` — paste PRD → creates full Linear roadmap
- `POST /api/webhook` — Linear webhook endpoint (point here from Linear settings)
- `GET /api/projects` — list projects
- `POST /api/projects` — add new project

## Setup

1. `npm install`
2. Copy `.env.example` → `.env.local`, fill in keys
3. Deploy to Vercel + add env vars in dashboard
4. Point Linear webhook → `https://your-runway.vercel.app/api/webhook`
