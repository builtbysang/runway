# Runway

**Context layer for vibe coding.** Runway keeps Claude grounded — it stores your project's goals, tech stack, and conventions in Notion, breaks the work into structured Linear issues, then lets Claude implement each one without losing the plot.

Vibe coding is fast but easy to get lost in. Runway gives it structure: a shared source of truth so every PR moves the project forward instead of sideways.

Built on: Next.js · Claude claude-opus-4-6 · Linear · GitHub · Notion

---

> 🇻🇳 **[Xem hướng dẫn tiếng Việt bên dưới](#tiếng-việt)**

---

## What it does

Runway runs as a standalone service between your project management and your codebase. It has two agents:

### Dev Agent
Triggered automatically when a Linear issue is moved to **"In Progress"**.

```
Linear "In Progress" → webhook → Claude reads files → implements → GitHub PR → Linear "In Review"
```

1. Receives Linear webhook
2. Reads relevant source files from GitHub
3. Calls Claude to implement the issue
4. Creates a branch + commits changes + opens a PR
5. Updates the Linear issue to "In Review" with a PR link and summary

### PM Agent
Called via API with a PRD text → creates a full Linear roadmap.

```
PRD text → Claude analyzes → Linear projects + sprints + issues created
```

1. Takes a Product Requirements Document (PRD) as input
2. Claude breaks it into releases, sprints, and individual issues
3. Creates Linear projects, cycles (sprints), and issues with priorities and estimates

---

## Use cases

- **Automate small-to-medium tickets** — bug fixes, UI tweaks, CRUD features, component additions
- **Spin up a roadmap from a PRD** — paste a PRD, get a fully structured Linear roadmap in seconds
- **Reuse across multiple projects** — one Runway deployment serves all your projects via `projects.json`

---

## Setup

### 1. Clone & install

```bash
git clone https://github.com/builtbysang/runway.git
cd runway
npm install
```

### 2. Configure your project

Edit `projects.json` to add your project:

```json
{
  "your-project": {
    "linearTeamId": "your-linear-team-id",
    "githubRepo": "yourorg/your-repo",
    "description": "What this project does",
    "techStack": "Next.js / TypeScript / Tailwind CSS"
  }
}
```

To find your Linear team ID: Linear → Settings → API → copy the team ID.

### 3. Set environment variables

```bash
# Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# Linear
LINEAR_API_KEY=lin_api_...
LINEAR_WEBHOOK_SECRET=lin_wh_...

# GitHub
GITHUB_TOKEN=ghp_...
```

### 4. Deploy to Vercel

```bash
vercel deploy --prod
```

Add env vars in Vercel dashboard under Settings → Environment Variables.

### 5. Create the Linear webhook

1. Go to Linear → **Settings → API → Webhooks → New Webhook**
2. URL: `https://your-runway-url.vercel.app/api/webhook`
3. Events: check **Issues**
4. Copy the signing secret → set as `LINEAR_WEBHOOK_SECRET`

---

## API

### `POST /api/webhook`
Receives Linear webhooks. Fires the Dev Agent when an issue transitions to "In Progress".

Auto-triggered by Linear — no manual calls needed.

---

### `POST /api/plan`
Run the PM Agent to create a Linear roadmap from a PRD.

```bash
curl -X POST https://your-runway-url.vercel.app/api/plan \
  -H "Content-Type: application/json" \
  -d '{
    "projectKey": "your-project",
    "prd": "We are building a personal finance app that helps users track..."
  }'
```

Response:
```json
{
  "ok": true,
  "projectUrl": "https://linear.app/team/project/...",
  "issueCount": 24,
  "summary": "Created 3 releases with 24 issues for Personal Finance App"
}
```

---

### `GET /api/projects`
List all configured projects.

### `POST /api/projects`
Add a new project config at runtime.

```bash
curl -X POST https://your-runway-url.vercel.app/api/projects \
  -H "Content-Type: application/json" \
  -d '{
    "key": "new-project",
    "linearTeamId": "abc-123",
    "githubRepo": "yourorg/new-project",
    "description": "New project description"
  }'
```

---

## Architecture

```
app/
  api/
    webhook/     # Linear webhook handler → Dev Agent
    plan/        # PM Agent endpoint
    projects/    # Project config management

agents/
  dev-agent.ts  # Issue → files → Claude → PR → Linear update
  pm-agent.ts   # PRD → Claude → Linear roadmap

skills/
  claude.ts     # analyzePRD(), implementIssue(), draftDocument()
  github.ts     # readFile(), readFiles(), createBranchAndPR()
  linear.ts     # createProject(), createIssue(), updateIssue(), addComment()

projects.json   # Multi-project config
vercel.json     # 300s timeout for AI functions
```

---

## Adding a new project

1. Add an entry to `projects.json`
2. Create a webhook in that project's Linear team pointing to the same Runway URL
3. Done — Runway will automatically route issues to the correct repo

---

## How the Dev Agent picks files

Runway analyzes the issue title and description to decide which files to read before calling Claude. It always reads `app/page.tsx` and `package.json`, then adds relevant files based on keywords (e.g. "nav" → reads nav component, "invest" → reads investment page).

You can extend `resolveFilePaths()` in `agents/dev-agent.ts` to match your project structure.

---

## Limits

- **Vercel Hobby plan:** Max 300s per function execution (set in `vercel.json`)
- **Complex issues:** Claude works best on well-described, self-contained tickets. Vague tickets get a comment explaining what's missing.
- **Large files:** If a file is very large, Claude may not have full context — keep descriptions specific

---

## License

MIT

---

## Tiếng Việt

**Runway** là context layer cho vibe coding — giải quyết vấn đề code nhanh nhưng hay bị bơi không biết mình đang đi đâu.

Runway lưu mục tiêu, tech stack, và convention của dự án vào Notion làm source of truth. Từ đó chia nhỏ công việc thành các Linear issue có cấu trúc, rồi để Claude implement từng cái một — đúng hướng, không lạc đề, không phải nhắc lại context mỗi lần.

Nền tảng: Next.js · Claude claude-opus-4-6 · Linear · GitHub · Notion

---

### Runway làm gì

Runway chạy như một service độc lập kết nối giữa quản lý dự án và codebase của bạn. Gồm hai agent:

#### Dev Agent
Tự động kích hoạt khi issue Linear được chuyển sang **"In Progress"**.

```
Linear "In Progress" → webhook → Claude đọc file → implement → GitHub PR → Linear "In Review"
```

1. Nhận webhook từ Linear
2. Claude tự khám phá repo — đọc các file cần thiết qua tool `read_file` / `list_dir`
3. Implement issue bằng tool `write_file`
4. Tạo branch + commit + mở PR trên GitHub
5. Cập nhật issue Linear sang "In Review" kèm link PR và tóm tắt

**Chọn model tự động theo độ phức tạp:**
- `simple` / `easy` / `xs` → claude-haiku-4-5 (nhanh, rẻ)
- mặc định → claude-sonnet-4-5
- `complex` / `hard` / `xl` → claude-opus-4-6 (mạnh nhất)

#### PM Agent
Gọi qua API với nội dung PRD → tạo roadmap Linear đầy đủ.

```
Nội dung PRD → Claude phân tích → Linear projects + sprints + issues
```

---

### Cài đặt

#### 1. Clone & cài dependencies

```bash
git clone https://github.com/builtbysang/runway.git
cd runway
npm install
```

#### 2. Cấu hình dự án

Sửa `projects.json` để thêm dự án của bạn:

```json
{
  "ten-du-an": {
    "linearTeamId": "linear-team-id-của-bạn",
    "githubRepo": "org/repo",
    "description": "Mô tả dự án",
    "techStack": "Next.js / TypeScript / Tailwind CSS",
    "notionContextPageId": "notion-page-id (tuỳ chọn)"
  }
}
```

Tìm Linear team ID: Linear → Settings → API → copy team ID.

`notionContextPageId` (tuỳ chọn): ID trang Notion chứa Brief/PRD của dự án. Runway đọc và nén thành context cho Claude (~300 token).

#### 3. Thiết lập biến môi trường

```bash
ANTHROPIC_API_KEY=sk-ant-...
LINEAR_API_KEY=lin_api_...
LINEAR_WEBHOOK_SECRET=lin_wh_...
GITHUB_TOKEN=ghp_...
NOTION_TOKEN=ntn_...   # tuỳ chọn
```

#### 4. Deploy lên Vercel

```bash
vercel deploy --prod
```

Thêm env vars tại Vercel dashboard → Settings → Environment Variables.

#### 5. Tạo webhook trên Linear

1. Linear → **Settings → API → Webhooks → New Webhook**
2. URL: `https://runway-url.vercel.app/api/webhook`
3. Events: chọn **Issues**
4. Copy signing secret → đặt làm `LINEAR_WEBHOOK_SECRET`

---

### API

#### `POST /api/webhook`
Nhận webhook từ Linear. Chạy Dev Agent khi issue chuyển sang "In Progress".

#### `POST /api/run`
Chạy hàng loạt Dev Agent trên nhiều issue cùng lúc (tuần tự).

```bash
curl -X POST https://runway-url.vercel.app/api/run \
  -H "Content-Type: application/json" \
  -d '{
    "projectKey": "ten-du-an",
    "stateName": "Todo",
    "cycleId": "sprint-id (tuỳ chọn)"
  }'
```

Runway tự động chuyển từng issue sang "In Progress" rồi implement lần lượt. Trả về kết quả ngay — theo dõi tiến độ trên Linear.

#### `POST /api/plan`
Tạo roadmap Linear từ PRD.

```bash
curl -X POST https://runway-url.vercel.app/api/plan \
  -H "Content-Type: application/json" \
  -d '{
    "projectKey": "ten-du-an",
    "prd": "Chúng tôi đang xây dựng ứng dụng tài chính cá nhân..."
  }'
```

---

### Kiến trúc

```
app/
  api/
    webhook/   # Linear webhook → Dev Agent
    run/       # Chạy hàng loạt issues
    plan/      # PM Agent
    projects/  # Quản lý config

agents/
  dev-agent.ts  # Issue → Claude tool-use loop → PR → Linear update
  pm-agent.ts   # PRD → Claude → Linear roadmap

skills/
  claude.ts   # implementIssue(), analyzePRD(), draftDocument()
  github.ts   # readFile(), readDir(), createBranchAndPR()
  linear.ts   # createIssue(), updateIssue(), listIssues(), addComment()
  notion.ts   # readProjectContext() — đọc & cache context từ Notion

projects.json  # Config đa dự án
```

---

### Giới hạn

- **Vercel Hobby plan:** Tối đa 60s mỗi function — dùng `/api/run` cho các task dài
- **Issue phức tạp:** Claude hoạt động tốt nhất với ticket được mô tả rõ ràng, tự chứa. Issue mơ hồ sẽ nhận comment giải thích còn thiếu gì
- **File lớn:** Claude tự quyết định đọc file nào — mô tả issue càng cụ thể càng tốt
