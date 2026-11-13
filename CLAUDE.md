# TravelPlan — luật cho Claude Code

File này và `.claude/rules/*` được nạp vào **mọi** phiên, nên chỉ chứa định nghĩa project và luật. Kiến thức chỉ cần cho một số việc nằm ở `.claude/reference/` (bảng cuối file) — chỉ đọc khi việc đang làm cần tới.

@.claude/rules/git-pr.md
@.claude/rules/tdd.md

## Phần 1 — Định nghĩa project

**TravelPlan** là trình lập lịch trình du lịch có agent: người dùng tạo trip qua wizard, worker gọi Gemini sinh ý định địa điểm, đối chiếu qua Google Places/Mapbox, gom cụm theo địa lý rồi dựng lịch trình theo ngày.

**Stack:** monorepo TypeScript (npm workspaces + turbo, Node ≥ 20). Backend Express 5 + Mongoose 9 + BullMQ/ioredis, Zod, Pino, Clerk (`@clerk/express`), Gemini (không phải OpenAI; model pin cứng ở `backend/src/config/gemini-models.ts`). Web React 19 + Vite 7 SPA (không phải Next.js), react-router v7, TanStack Query, Zustand, Tailwind + shadcn/ui, Mapbox GL. MongoDB Atlas, Redis. Python (`analytics/`, `services/`) dùng venv riêng.

**Layout thật** (`docs/agents/*.md`, `docs/PLAN.md` mô tả layout khác — đừng tìm `web/`, `api/`, `worker/`):

| Thư mục            | Nội dung                                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------------------ |
| `backend/`         | Một workspace chứa cả API (`src/index.ts` → `createApp()` ở `src/app.ts`) và worker BullMQ (`src/worker.ts`) |
| `frontend/web/`    | SPA chính                                                                                                    |
| `frontend/mobile/` | Expo/React Native, giai đoạn sớm                                                                             |
| `packages/shared/` | `@travelplan/shared`: Zod schema, type, constant dùng chung (build bằng `tsup`)                              |
| `analytics/`       | Python: `abkit` (experimentation), `simkit` (mô phỏng) — B2, thêm dần                                        |
| `services/`        | Python service của B3 — thêm dần                                                                             |
| `e2e/`             | Playwright, không thuộc workspace npm nào                                                                    |

**Các lớp backend:** controller mỏng (validate Zod → gọi service → trả JSON), service chứa business logic, repository chỉ chạm DB và không có logic. Controller chạm thẳng Mongoose là lỗi review.

- **Fire & Listen:** `POST /api/trips` validate → `tripQueue.add()` → trả `{ jobId }` ngay; controller không bao giờ `await` việc sinh trip. Worker gọi `job.updateProgress()` ở từng bước, lưu kết quả từng phần.
- **Trip state machine:** `DRAFT → QUEUED → PROCESSING → COMPLETED` (↘ `FAILED`); worker kiểm `Trip.status` trước mỗi bước (idempotent).
- **AI là service không tin cậy:** AI không gọi API ngoài trực tiếp, chỉ qua tool ở `backend/src/features/planner/tools/`; mọi place AI sinh phải đối chiếu qua `searchPlaces`; circuit breaker `opossum` bọc Places/Mapbox; retry AI tối đa 3 lần rồi fail gracefully.
- Pipeline lịch trình (6 bước cố định): xem skill `itinerary-builder`.

**Shared Kernel:** `packages/shared` là nguồn sự thật duy nhất của data contract — chỉ Zod schema, TS type, error code, constant; cấm UI, business logic, model DB. Thay đổi chéo lớp đi theo thứ tự `packages/shared` → backend → frontend (chạy `npm run build:shared` sau khi sửa shared). Sửa catalog analytics (`schemas/analytics.schema.ts`) thì chạy `npm run export:json-schema -w packages/shared` để cập nhật `packages/shared/json-schema/` (Python đọc file này; test parity chặn nếu lệch). Sửa thuật toán gán nhóm (`backend/src/features/experiments/services/assignment.ts`) thì chạy `npm run generate:assignment-vectors -w backend` để cập nhật `packages/shared/fixtures/assignment-vectors.json` (TS và Python cùng đối chiếu).

**Repository Symmetry:** mỗi domain có mặt đối xứng ở `frontend/web/src/features/<domain>/`, `backend/src/features/<domain>/` và (khi có contract chung) `packages/shared/src/schemas/<domain>.ts`.

**Env:** biến mới khai trong `backend/src/config/env.ts` (envalid, crash lúc boot nếu thiếu biến bắt buộc) **và** `.env.example` — test `env-example-parity.test.ts` chặn nếu thiếu. Logging bằng Pino (`backend/src/lib/logger.ts`), không `console.log`; `logger.error({ err }, "msg")`.

**4 lớp test** (chi tiết setup: `.claude/reference/test-infra.md`):

| Lớp                     | Lệnh                                                         | Ghi chú                                                                             |
| ----------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Shared + backend unit   | `npm run test -w packages/shared`, `npm run test -w backend` | Mock repository/queue bằng `vi.mock()`, không gọi AI/Places thật                    |
| Frontend unit/component | `npm run test -w frontend/web`                               | MSW, `renderWithProviders`                                                          |
| Backend integration     | `npm run test:integration -w backend`                        | Mongo/Redis thật (`docker compose up -d mongodb redis`), DB chung `travelplan_test` |
| E2E Playwright          | `npm run e2e`                                                | Cần `.env.e2e`; job CI không bắt buộc                                               |

Gate chung: `npm run lint`, `npm run typecheck`, `npm run build` (chạy `build:shared` trước nếu sửa shared).

**Môi trường:** `develop` → staging (Railway env `staging` + Vercel Preview), `main` → production. 3 check bắt buộc trên PR: `Lint + Unit Tests`, `Typecheck + Build`, `Backend Docker Build`. Chi tiết hạ tầng: `.claude/reference/deploy-ops.md`.

## Phần 2 — Luật

**Quyền** (theo `Conductor/docs/authority.md` — `D:\Desktop\Conductor\docs\authority.md` trên máy của Lam):

- Mọi thay đổi đi qua PR vào `develop`; không commit/push thẳng `develop` hay `main`.
- PR vào `develop` được tự merge khi 3 check bắt buộc xanh **và** review độc lập PASS (squash).
- Release `develop` → `main` theo điều lệ trên; ngoài điều lệ đó thì `main` là của chủ repo — câu rộng kiểu "làm hết đi" không phải uỷ quyền merge `main`. Merge `main` là merge commit thật, không squash.
- **Chi phí tối đa $0:** không bật dịch vụ trả phí, không vượt free tier/credit. Không chắc có tốn tiền không thì coi như có và không làm.

**Hai loại phiên:**

- **Phiên headless của conductor:** làm trong worktree được giao (không `EnterWorktree`), không `/pr`, `/ci-watch`, `ScheduleWakeup`, không merge, không chờ CI. Commit → push → mở PR → dừng, dòng cuối in đúng một trong `RESULT: pushed <số PR>`, `RESULT: failed <lý do>`, `RESULT: blocked <việc chủ repo phải làm>`. Không sửa `.claude/settings*.json`, `.claude/scripts/`, hook.
- **Phiên tay:** gọi `EnterWorktree` trước khi sửa file đầu tiên, đưa nhánh về `origin/develop` (xem `.claude/rules/git-pr.md`). `/pr` và `/ci-watch` dùng khi muốn, không bắt buộc.

**TDD:** commit đầu tiên chỉ chứa test đỏ; chạy và thấy đỏ đúng lý do; PR có mục `## RED` dán output đỏ đó. Không commit code mới thiếu test. Chi tiết: `.claude/rules/tdd.md`.

**Kích thước file:** mỗi file một trách nhiệm; tách khi file trộn nhiều việc hoặc dài quá khoảng 300 dòng. Không còn trần cứng — file cũ dài hơn không phải nợ phải trả ngay.

**An toàn dữ liệu:**

- Zod ở mọi biên vào (request, response API, output AI, file đọc vào).
- Output AI: `sanitize-html` trước khi ghi MongoDB, `DOMPurify` trước khi render; cấm `dangerouslySetInnerHTML` trần.
- Không đọc, in hay commit secret (`.env*`, key, token).
- Test không bao giờ chạm DB production — chỉ `travelplan_test`, `travelplan_e2e`, Docker local hoặc dữ liệu offline.
- PII (email, userId Clerk, IP…) phải băm trước khi vào tầng phân tích (`analytics/`, event lưu để phân tích).

**Trung thực số đo:** mọi con số trong README phải có trong `analytics/runs/runs.csv`. Người dùng mô phỏng luôn ghi "simulated"/"virtual users" và đếm riêng với người dùng thật; kết quả mô phỏng viết theo hướng "recovered a known injected effect".

**Python trong `analytics/` và `services/`:** venv riêng mỗi worktree (`analytics/.venv`, cài bằng `pip install -e ".[dev]"`), ghim phiên bản dependency, `ruff check`, `ruff format --check`, `pytest -q` xanh trước khi push.

**Tiết kiệm token:** chỉ chạy test liên quan tới thay đổi với reporter gọn (`npx vitest run <files> --reporter=dot`, `pytest -q`); full lint/typecheck/test một lần trước khi push. Chỉ đọc file trong `.claude/reference/` khi việc cần tới. Không dán lại plan hay tóm tắt dài.

**Nợ kỹ thuật:** bug gặp ngoài phạm vi việc đang làm thì không tự sửa — viết test khẳng định hành vi hiện tại kèm `[BUG]`, rồi ghi vào `.claude/reference/tech-debt.md` đủ 3 phần: triệu chứng, nguyên nhân kèm `file:line`, điều kiện kích hoạt. Sửa xong thì xoá mục đó trong cùng commit.

**Giữ luật cập nhật:** việc làm đổi convention, tooling hay quy trình thì sửa `CLAUDE.md`/`.claude/rules/*` (luật) hoặc `.claude/reference/*` (kiến thức) trong cùng PR. Lịch sử PR không ghi vào đây — đã có trong git. Không tạo file `.md` mới ở thư mục gốc (chỉ `README.md`, `CLAUDE.md`). Test `backend/src/config/claude-docs-parity.test.ts` giữ phần nạp tự động dưới 24 KB.

## Tham khảo theo nhu cầu (`.claude/reference/`, không nạp tự động)

| File                                 | Đọc khi                                                                                                    |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `.claude/reference/pitfalls.md`      | Đụng BullMQ/Redis, Mongoose, Pino, CORS, Gemini quota, CI workflow, MCP/OAuth, Docker local, Windows shell |
| `.claude/reference/tech-debt.md`     | Trước khi sửa một module (xem nó có bug đã biết không); khi ghi nợ mới                                     |
| `.claude/reference/deploy-ops.md`    | Railway, Vercel, staging, Sentry, backup Mongo, billing/quota GCP, `railway.toml`                          |
| `.claude/reference/test-infra.md`    | Dựng/sửa test integration, E2E Playwright, RAG eval, các script đo (`measure:*`)                           |
| `.claude/reference/ui-design.md`     | Mọi thay đổi UI ở `frontend/web`: pre-flight `ui-ux-pro-max`, quy ước UI, i18n 3 ngôn ngữ, `data-testid`   |
| `.claude/reference/debug-browser.md` | Sửa bug quan sát được qua trình duyệt (verify bằng `chrome-devtools` trước và sau khi sửa)                 |

Skills ở `.claude/skills/` (`itinerary-builder`, `rag-destinations`, `travelplan-devops`, `ui-ux-pro-max`, `ui-styling`) tự nạp theo mô tả. MCP: `github`, `chrome-devtools` khai ở `.mcp.json` (cạm bẫy OAuth ở `pitfalls.md`).
