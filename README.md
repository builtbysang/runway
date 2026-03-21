# Runway ✈️

AI-powered PM + Dev automation. Deploy once, use for every project.

## What it does

| Agent | Trigger | Output |
|-------|---------|--------|
| **PM Agent** | POST a PRD | Linear project + sprints + issues |
| **Dev Agent** | Linear issue → "In Progress" | GitHub PR + Linear → "In Review" |
| **Doc Agent** | POST context + doc type | Project Brief or PRD pushed to Notion |

## API

- `POST /api/plan` — paste PRD → creates full Linear roadmap
- `POST /api/webhook` — Linear webhook endpoint (point here from Linear settings)
- `GET /api/projects` — list projects
- `POST /api/projects` — add new project
- `POST /api/doc` — context + docType + notionParentId → Project Brief or PRD in Notion

## Setup

1. `npm install`
2. Copy `.env.example` → `.env.local`, fill in keys
3. Deploy to Vercel + add env vars in dashboard
4. Point Linear webhook → `https://your-runway.vercel.app/api/webhook`

### Doc Agent setup

1. Create a Notion integration at https://www.notion.so/my-integrations
2. Add `NOTION_API_KEY=secret_...` to your env vars
3. Open the Notion page or database where docs should live → **Add connections** → select your integration
4. Copy the page ID from the URL (32-char hex at the end)

```bash
# Example: generate a PRD from rough notes
curl -X POST https://your-runway.vercel.app/api/doc \
  -H "Content-Type: application/json" \
  -d '{
    "context": "We need a way for users to connect their Shopify store. Currently they paste CSV exports manually. Pain: 30 min setup, frequent errors. Goal: OAuth flow, auto-sync every hour.",
    "docType": "prd",
    "notionParentId": "YOUR_NOTION_PAGE_ID"
  }'
```
