# Runway

[English](./README.md)

Runway là agent runtime local-first cho workflow phát triển phần mềm.

Nó kết nối product intake, Linear planning, GitHub implementation, ghi report dạng markdown, sync Notion khi cần, và soạn issue có gắn Figma trong một CLI workflow rõ ràng. Repo này không còn chạy theo kiểu web app có webhook tự động nữa.

## Workflow hiện tại

Runway được thiết kế theo flow review-first:

1. Bạn gửi yêu cầu tính năng hoặc brief sản phẩm.
2. `product-intake` phân tích yêu cầu và tạo draft issue trên Linear.
3. Bạn review các issue đó trên Linear.
4. Nếu cần, bạn thêm hoặc chỉnh link Figma trên issue.
5. `refine` nâng chất issue khi cần.
6. Chỉ khi bạn quyết định build thì mới chạy `run` cho issue đã được approve.

Nói ngắn gọn:

- Runway không tự code ngay khi vừa nhận yêu cầu.
- Runway không auto-trigger theo trạng thái Linear ở phiên bản hiện tại.
- Nếu bạn có Figma, Figma là source of truth ưu tiên.

## Agent và workflow

Runway hiện có ba lớp agent chính cùng một vài workflow hỗ trợ:

- `Product Agent`
  - phân tích yêu cầu
  - ưu tiên Figma nếu có
  - tạo draft issue nhỏ, dễ review trên Linear
  - không code

- `PM Agent`
  - `plan`: biến PRD thành roadmap theo `phase -> release -> sprint -> issue`
  - `refine`: chuẩn hóa issue description, estimate, complexity và workstream
  - `report`: tạo progress report dạng markdown từ dữ liệu Linear
  - `syncNotion`: chỉ sync trạng thái lên Notion khi bạn chủ động chạy

- `Dev Agent`
  - implement issue đã được approve
  - dùng local authenticated CLI backend (`codex` hoặc `claude`)
  - ưu tiên local repo path nếu có
  - mở PR và chuyển issue sang `In Review`

Workflow hỗ trợ:

- `sprint-review`: retrospective và carry-over issues
- `projects`: quản lý `projects.json`
- `write-report`: ghi report ra file `.md` trong repo

## Vì sao dùng CLI-first

Logic chính của sản phẩm nằm ở:

- `agents/`
- `commands/`
- `skills/`

Layer `Next.js` và webhook cũ đã được bỏ. Kiến trúc hiện tại ưu tiên nhẹ, rõ, và explicit: bạn chạy command nào thì hành động đó mới diễn ra.

## Yêu cầu

- `Node.js 20.x`
- `npm`
- local authenticated LLM CLI: `codex` hoặc `claude`
- `LINEAR_API_KEY`
- `GITHUB_TOKEN`
- `NOTION_TOKEN` nếu muốn dùng Notion

## Cài đặt

```bash
git clone https://github.com/builtbysang/runway.git
cd runway
npm install
```

## Cấu hình project

Runway dùng `projects.json` làm registry local cho các project mà nó có thể thao tác.

Ví dụ:

```json
{
  "your-project": {
    "linearTeamId": "your-linear-team-id",
    "githubRepo": "yourorg/your-repo",
    "localRepoPath": "/absolute/path/to/your/local/repo",
    "description": "What this project does",
    "techStack": "TypeScript / Node.js",
    "notionContextPageId": "optional-notion-context-page-id",
    "notionSyncPageId": "optional-notion-status-page-id"
  }
}
```

Ý nghĩa các field:

- `linearTeamId`: team ID của Linear
- `githubRepo`: repo GitHub dạng `owner/name`
- `localRepoPath`: path tuyệt đối tới codebase local, rất nên khai báo để Dev Agent bám đúng repo local
- `description`: mô tả ngắn để dùng trong report
- `techStack`: ngữ cảnh kỹ thuật cho agent
- `notionContextPageId`: page Notion chỉ để đọc context
- `notionSyncPageId`: page Notion để sync trạng thái khi cần

## Biến môi trường

Tạo `.env.local`:

```bash
LINEAR_API_KEY=lin_api_...
GITHUB_TOKEN=ghp_...
NOTION_TOKEN=secret_... # optional
```

Ghi chú:

- Bạn có thể khai báo `LINEAR_API_KEY`, `GITHUB_TOKEN`, `NOTION_TOKEN` một lần và giữ nguyên.
- Đổi backend giữa Codex và Claude bằng npm script, không cần sửa file env mỗi lần.
- Runway dùng session local đã đăng nhập của `codex` hoặc `claude`, không gọi trực tiếp OpenAI/Anthropic API nữa.
- `GITHUB_TOKEN` cần quyền ghi nếu muốn Runway tự mở PR.
- `NOTION_TOKEN` là optional. Nếu thiếu, Runway sẽ bỏ qua phần Notion context enrichment và sync.
- Mặc định nên lưu report ra file `.md`. Notion chỉ nên sync khi bạn yêu cầu.

## Lệnh phát triển

Trong lúc phát triển:

```bash
npm run dev -- <command>
npm run dev:codex -- <command>
npm run dev:claude -- <command>
```

Sau khi build:

```bash
npm run build
npm start -- <command>
```

Sanity checks:

```bash
npm run dev -- doctor
npm run dev:codex -- doctor
npm run dev:claude -- doctor
npm run dev -- write-report --project your-project
npm run check
npm run build
npm run dev -- help
```

## Dùng với Codex hoặc Claude

Flow vận hành khuyến nghị khi user gửi brief hoặc link Figma:

1. Chạy `product-intake` trước.
2. Review issue đã tạo trên Linear.
3. Thêm hoặc chỉnh link Figma nếu cần.
4. Chạy `refine` nếu muốn nâng chất issue.
5. Chỉ chạy `run` khi bạn thực sự muốn code được tạo.

Nếu dùng Codex:

```bash
cp .env.example .env.local
```

Sau đó set:

```bash
LINEAR_API_KEY=lin_api_...
GITHUB_TOKEN=ghp_...
```

Và đảm bảo `codex` đã được cài và login trên máy này.

Nếu dùng Claude Code:

```bash
cp .env.example .env.local
```

Sau đó set:

```bash
LINEAR_API_KEY=lin_api_...
GITHUB_TOKEN=ghp_...
```

Và đảm bảo `claude` đã được cài và login trên máy này.
Nếu Claude fail ngay lần chạy đầu với lỗi `401`, hãy chạy lại `claude auth login` dù `claude auth status` trông vẫn ổn.

Chuyển nhanh giữa hai backend:

```bash
npm run dev:codex -- doctor
npm run dev:claude -- doctor
```

Ví dụ:

```bash
npm run dev:codex -- product-intake --project your-project --brief-file ./docs/brief.md
npm run dev:claude -- run --project your-project --issues BUI-123
```

Trước lần chạy thật đầu tiên, nên dùng:

```bash
npm run dev -- doctor
```

Lệnh này sẽ báo:

- backend local nào đang được dùng
- có `codex` / `claude` không
- login status cơ bản
- còn thiếu token nào
- project nào chưa gắn `localRepoPath`

## Tham chiếu lệnh

### `product-intake`

Phân tích feature request và tạo draft issue trên Linear để người review.

Từ file:

```bash
npm run dev -- product-intake \
  --project your-project \
  --brief-file ./docs/brief.md
```

Kèm Figma:

```bash
npm run dev -- product-intake \
  --project your-project \
  --brief-file ./docs/brief.md \
  --figma-url https://www.figma.com/design/...
```

Lệnh này không code.

### `doctor`

Kiểm tra môi trường hiện tại đã sẵn sàng chạy Runway chưa.

```bash
npm run dev -- doctor
```

Lệnh này đặc biệt hữu ích khi setup trên máy mới hoặc shell session mới.

### `plan`

Biến PRD thành roadmap `phase -> release -> sprint -> issue`.

```bash
npm run dev -- plan \
  --project your-project \
  --prd-file ./docs/prd.md
```

### `refine`

Chuẩn hóa issue trên Linear.

```bash
npm run dev -- refine --project your-project
```

Bạn cũng có thể giới hạn theo issue hoặc state:

```bash
npm run dev -- refine \
  --project your-project \
  --issues BUI-123,BUI-124
```

### `run`

Chạy Dev Agent cho issue đã được approve.

```bash
npm run dev -- run \
  --project your-project \
  --issues BUI-123
```

### `report`

Tạo markdown progress report từ dữ liệu Linear.

```bash
npm run dev -- report --project your-project
```

Trả về JSON gồm:

- `stats`
- `report`

### `write-report`

Ghi report markdown ra file `.md`. Đây là output mặc định nên dùng thay vì sync Notion.

```bash
npm run dev -- write-report --project your-project
```

Ghi vào path tùy chỉnh:

```bash
npm run dev -- write-report \
  --project your-project \
  --cycle sprint-id \
  --output docs/reports/sprint-12.md
```

Mặc định file sẽ nằm ở:

```text
docs/reports/<project>.md
```

hoặc:

```text
docs/reports/<project>-<cycleId>.md
```

### `sync-notion`

Sync status snapshot lên Notion chỉ khi bạn chủ động muốn.

```bash
npm run dev -- sync-notion --project your-project
```

Ưu tiên `write-report` cho workflow bình thường. `sync-notion` nên là manual step.

### `sprint-review`

Tạo sprint retrospective và carry-over issues nếu cần.

```bash
npm run dev -- sprint-review \
  --project your-project \
  --cycle sprint-id \
  --next-cycle next-sprint-id
```

### `projects list`

Liệt kê project trong `projects.json`.

```bash
npm run dev -- projects list
```

### `projects add`

Thêm project mới vào `projects.json`.

```bash
npm run dev -- projects add \
  --key your-project \
  --team-id your-linear-team-id \
  --repo yourorg/your-repo \
  --local-repo-path /absolute/path/to/repo \
  --description "What this project does" \
  --tech-stack "TypeScript / Node.js" \
  --notion-page-id optional-notion-context-page-id \
  --notion-sync-page-id optional-notion-status-page-id
```

## Cấu trúc repo

```text
agents/       Logic orchestration của agent
commands/     CLI command handlers
skills/       Tích hợp với Linear, GitHub, local LLM CLI, Notion, theSVG
lib/          Tiện ích config và parse CLI
docs/         Nơi nên lưu markdown output
```
