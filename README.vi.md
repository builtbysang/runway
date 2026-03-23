# Runway

[English](./README.md)

Runway là agent runtime dạng chat-first dành cho team phát triển phần mềm.

Trong cách dùng bình thường, bạn chỉ cần chat bằng ngôn ngữ tự nhiên:

- "Phân tích brief này và tạo issue"
- "Tạo steering docs cho project này"
- "Refine backlog"
- "Viết status report"
- "Implement BUI-123"

Runway sẽ map ý định đó sang workflow nội bộ phù hợp. CLI vẫn tồn tại, nhưng chủ yếu dành cho operator hoặc debug.

## Runway làm gì

Runway xoay quanh ba lớp agent chính:

- `Product Agent`
  - phân tích brief hoặc feature request
  - ưu tiên Figma nếu có
  - tạo draft issue trên Linear để review
  - không code

- `PM Agent`
  - biến PRD thành roadmap theo `phase -> release -> sprint -> issue`
  - chuẩn hóa issue description, estimate, complexity và workstream
  - tạo markdown report
  - tạo steering docs
  - chỉ sync Notion khi bạn yêu cầu

- `Dev Agent`
  - triển khai issue đã được approve
  - dùng local authenticated CLI backend: `codex` hoặc `claude`
  - mở GitHub PR
  - cập nhật Linear sang `In Review`

Workflow hỗ trợ:

- `write-report` ghi status ra file `.md`
- `write-steering` tạo steering docs của Runway
- `sprint-review` tạo retrospective và carry-over issues
- `projects` quản lý project registry local

## Cách dùng Runway

Giao diện chính là chat.

Ví dụ chat thường gặp:

- "Biến brief này thành issue trên Linear"
- "Dùng Figma này để chuẩn bị issue implementation"
- "Tạo steering docs cho wealth-next"
- "Viết report hiện tại ra markdown"
- "Implement issue BUI-123"

Layer command chỉ thực sự cần khi bạn muốn:

- điều khiển thủ công
- debug local
- chạy script
- fallback sang execution chính xác bằng tay

## Workflow

Runway được thiết kế theo flow review-first:

1. Bạn cung cấp brief, feature request hoặc PRD.
2. `product-intake` hoặc `plan` tạo cấu trúc trên Linear.
3. Bạn review và chỉnh scope trên Linear.
4. Bạn thêm hoặc cập nhật link Figma khi cần.
5. `refine` nâng chất lượng issue.
6. `write-steering` tạo guidance lâu dài trong `.runway/steering/`.
7. `run` chỉ được dùng cho các issue bạn chủ động approve để build.

Flow này giúp tách rõ planning, UX intent và implementation approval.

## Project context

Runway ưu tiên context ngắn gọn, có version control, thay vì dựa quá nhiều vào tài liệu nặng.

Thứ tự ưu tiên context:

1. `.runway/steering/product.md`
2. `.runway/steering/structure.md`
3. `.runway/steering/tech.md`
4. `.runway/steering/02-ux-rules.md`
5. `.runway/steering/03-visual-rules.md`
6. `.runway/steering/04-design-system.md`
7. optional Notion context page

Mục tiêu là để agent luôn có rule quan trọng của project mà không tốn nhiều token.

## Cấu trúc repo

```text
agents/       Logic orchestration của agent
commands/     CLI command handlers
skills/       Tích hợp và lớp adapter cho model/runtime
lib/          Tiện ích nhỏ dùng chung
scripts/      Helper scripts
docs/         Nơi nên lưu markdown output
```

## Yêu cầu

- `Node.js 20.x`
- `pnpm`
- một local authenticated LLM CLI:
  - `codex`
  - hoặc `claude`
- `LINEAR_API_KEY`
- `GITHUB_TOKEN`
- optional `NOTION_TOKEN`

## Cài đặt

```bash
git clone https://github.com/builtbysang/runway.git
cd runway
pnpm install
```

## Cấu hình project

Runway dùng `projects.json` như một local registry.

Ví dụ:

```json
{
  "wealth-next": {
    "linearTeamId": "your-linear-team-id",
    "githubRepo": "yourorg/your-repo",
    "localRepoPath": "/absolute/path/to/your/local/repo",
    "description": "Vietnamese personal finance app",
    "techStack": "Next.js / TypeScript / Tailwind / Supabase",
    "notionContextPageId": "optional-notion-context-page-id",
    "notionSyncPageId": "optional-notion-sync-page-id"
  }
}
```

Ý nghĩa các field:

- `linearTeamId`: team Linear dùng cho issues, labels, cycles và projects
- `githubRepo`: repo GitHub dạng `owner/name`
- `localRepoPath`: path tuyệt đối tới codebase local mà Runway sẽ dùng cho implementation và steering docs
- `description`: tên hiển thị dễ đọc cho project
- `techStack`: ngữ cảnh kỹ thuật ngắn gọn cho agent
- `notionContextPageId`: nguồn context chỉ để đọc
- `notionSyncPageId`: nơi ghi status lên Notion nếu cần

## Environment

Tạo `.env.local`:

```bash
LINEAR_API_KEY=lin_api_...
GITHUB_TOKEN=ghp_...
NOTION_TOKEN=secret_... # optional
```

Ghi chú:

- Chỉ cần khai báo `LINEAR_API_KEY`, `GITHUB_TOKEN`, `NOTION_TOKEN` một lần ở đây.
- Đổi giữa Codex và Claude bằng pnpm script, không cần sửa env mỗi lần.
- `GITHUB_TOKEN` nên có quyền đủ để tạo branch và PR.
- `NOTION_TOKEN` là optional, chỉ cần nếu muốn đọc context từ Notion hoặc sync lên Notion.

## Dùng Codex hoặc Claude

Trải nghiệm đúng của Runway vẫn là chat-first.

Bạn chat với Codex hoặc Claude, còn agent sẽ quyết định khi nào cần gọi workflow nội bộ của Runway.

Chỉ dùng CLI trực tiếp khi bạn muốn operator control thật chính xác.
Local CLI đã login sẵn là thứ Runway dùng bên dưới.

Với Codex:

```bash
pnpm dev:codex -- doctor
pnpm dev:codex -- product-intake --project your-project --brief-file ./docs/brief.md
```

Với Claude:

```bash
pnpm dev:claude -- doctor
pnpm dev:claude -- run --project your-project --issues BUI-123
```

Nếu Claude lỗi `401`, hãy refresh session bằng:

```bash
claude auth login
```

## Steering docs

Runway hỗ trợ steering docs của Runway trong repo đích:

```text
.runway/steering/product.md
.runway/steering/structure.md
.runway/steering/tech.md
.runway/steering/02-ux-rules.md
.runway/steering/03-visual-rules.md
.runway/steering/04-design-system.md
```

Tạo chúng bằng:

```bash
pnpm dev -- write-steering \
  --project your-project \
  --context-file ./docs/prd.md
```

Hoặc truyền inline:

```bash
pnpm dev -- write-steering \
  --project your-project \
  --context "Project context here"
```

Steering docs nên được dùng cho:

- định hướng sản phẩm
- ranh giới module/repo
- ràng buộc kỹ thuật và coding conventions
- UX principles, flow, hierarchy, writing, behavior
- visual style, color direction, mood, art direction
- tokens, components, patterns, states, layout system

## Reports

Markdown là output mặc định.

Ghi project report:

```bash
pnpm dev -- write-report --project your-project
```

Ghi sprint report:

```bash
pnpm dev -- write-report \
  --project your-project \
  --cycle sprint-id \
  --output docs/reports/sprint-12.md
```

Path mặc định:

```text
docs/reports/<project>.md
docs/reports/<project>-<cycleId>.md
```

`sync-notion` chỉ nên dùng khi bạn thật sự muốn đẩy cùng nội dung đó lên Notion.

## Operator commands

### `doctor`

Kiểm tra môi trường hiện tại đã sẵn sàng chạy Runway chưa.

```bash
pnpm dev -- doctor
pnpm dev:codex -- doctor
pnpm dev:claude -- doctor
```

### `product-intake`

Phân tích brief và tạo issue review-ready trên Linear.

```bash
pnpm dev -- product-intake \
  --project your-project \
  --brief-file ./docs/brief.md
```

Kèm Figma:

```bash
pnpm dev -- product-intake \
  --project your-project \
  --brief-file ./docs/brief.md \
  --figma-url https://www.figma.com/design/...
```

### `plan`

Biến PRD thành roadmap.

```bash
pnpm dev -- plan \
  --project your-project \
  --prd-file ./docs/prd.md
```

### `refine`

Nâng chất lượng issue và metadata.

```bash
pnpm dev -- refine --project your-project
```

Hoặc refine một nhóm issue cụ thể:

```bash
pnpm dev -- refine \
  --project your-project \
  --issues BUI-123,BUI-124
```

### `run`

Triển khai issue đã được approve.

```bash
pnpm dev -- run \
  --project your-project \
  --issues BUI-123
```

### `report`

Trả về markdown report dưới dạng JSON.

```bash
pnpm dev -- report --project your-project
```

### `write-report`

Ghi markdown report ra file.

```bash
pnpm dev -- write-report --project your-project
```

### `write-steering`

Ghi steering docs vào `.runway/steering/` của repo đích.

```bash
pnpm dev -- write-steering \
  --project your-project \
  --context-file ./docs/prd.md
```

### `sync-notion`

Ghi status snapshot lên Notion.

```bash
pnpm dev -- sync-notion --project your-project
```

### `sprint-review`

Tạo sprint retrospective và carry-over issues nếu cần.

```bash
pnpm dev -- sprint-review \
  --project your-project \
  --cycle sprint-id \
  --next-cycle next-sprint-id
```

### `projects list`

```bash
pnpm dev -- projects list
```

### `projects add`

```bash
pnpm dev -- projects add \
  --key your-project \
  --team-id your-linear-team-id \
  --repo yourorg/your-repo \
  --local-repo-path /absolute/path/to/repo \
  --description "What this project does" \
  --tech-stack "TypeScript / Node.js"
```

## Helper script

```bash
./scripts/run-sprint.sh --project your-project --cycle sprint-id
```

## License

Repo hiện chưa có file license riêng. Hãy thêm license trước khi coi đây là phần mềm open-source có license chính thức.
