# Hạ tầng test và đo

Quy trình TDD: `.claude/rules/tdd.md`. File này là chi tiết setup và cạm bẫy.

## Backend unit (`backend/vitest.config.ts`)

`include: ["src/**/*.test.ts"]`, **exclude** `*.integration.test.ts`. `test.env` set sẵn biến envalid bắt buộc (`MONGO_URI`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SIGNING_SECRET`, `GEMINI_API_KEY`, `STRIPE_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`) để hermetic. `CLERK_WEBHOOK_SIGNING_SECRET` dummy phải là base64 hợp lệ sau `whsec_` (svix throw lúc construct). Guard repo-level: `config/env-example-parity.test.ts` (`.env.example` phủ mọi key envalid), `config/claude-docs-parity.test.ts` (luật Claude nạp tự động nhỏ, reference tồn tại).

## Backend integration (`backend/vitest.integration.config.ts`)

- Mongo + Redis thật: `docker compose up -d mongodb redis` (`travelplan_admin`/`dev_password_change_in_prod`, db `travelplan_test`). Setup `backend/src/test/integration-setup.ts`: env fallback bằng `??=`, xoá collection sau mỗi test, obliterate queue `trip-generation` trong `afterAll`.
- `GOOGLE_PLACES_API_KEY`/`MAPBOX_ACCESS_TOKEN` bị gán `= ""` vô điều kiện — `config/env.ts` nạp `backend/.env` trước setup, `??=` sẽ để key thật lọt vào và bill Places thật.
- `supertest` + `createApp()` (`backend/src/app.ts` dựng app mà không connect DB/bind port). Auth: `resolve.alias` trỏ `@clerk/express` sang `backend/src/test/clerk-express.stub.ts` (header `x-test-user-id`) — không cần `vi.mock` riêng.
- `fallback-false-healthy.integration.test.ts` chạy `createWorker()` BullMQ thật; `worker-lock-duration.integration.test.ts` dựng stall bằng child process busy-loop. Hai file này flake nếu worktree khác đang có worker sống trên Redis local (xem `pitfalls.md`).

## Frontend (`frontend/web/vitest.config.ts`)

`src/test/renderWithProviders.tsx` (component, `gcTime: 0`) và `src/test/renderHookWithQuery.tsx` (hook, **không** `gcTime: 0` vì hook đọc/ghi cache không có subscriber). Factory ở `src/test/factories/` (`makeTrip`, `makeActivity`). `src/test/setup.ts` polyfill `ResizeObserver`/`IntersectionObserver`/`matchMedia`/`scrollIntoView` (stub, không mô phỏng kích thước thật). `npm run typecheck -w frontend/web` chạy `tsc -p tsconfig.app.json`.

## E2E Playwright (`e2e/`)

- `npm run e2e` (bỏ `@live`), `npm run e2e -- --ui`. Spec: `auth`, `wizard-navigation`, `wizard-paywall`, `create-trip` (zero AI spend — không có worker). Spec `@live` gọi Gemini/Places thật chưa có.
- Auth: project `setup` đăng nhập qua `clerk.signIn()` (Backend API) → `e2e/.auth/user.json`; `auth.spec.ts` chạy ở `chromium-anon`. Fixture `e2e/support/fixtures.ts` gọi `setupClerkTestingToken` mỗi test.
- DB `travelplan_e2e`, drop mỗi run trong `global-setup.ts` (guard URI cứng; free tier 10 trip/tháng). Không thêm route reset test-only vào API.
- Credentials Clerk **test instance**: `.env.e2e` local, secret `CLERK_*_E2E`/`E2E_USER_*` trên CI; `global-setup.ts` throw nếu key `pk_live_`/`sk_live_`.
- `playwright.config.ts`'s `apiEnv` phải tự cấp `CLERK_WEBHOOK_SIGNING_SECRET`, `GEMINI_API_KEY`, `STRIPE_SECRET_KEY` — local có `backend/.env` che lỗi, CI thì không.
- `storageState` chuỗi tương đối resolve theo `process.cwd()` — dùng `path.resolve(__dirname, …)`.
- `DatePicker` (react-day-picker v9): label ngày `format(date, "PPPP")`; StepBasics có 2 picker cùng lúc → scope theo popover (`e2e/support/date-picker.ts`'s `pickDate()`).
- `[data-testid^="trip-card-"]` khớp cả `trip-card-title` — thêm tag-scope (`div[...]`).
- `TripStatusBadge` có testid nhưng kiểm lại có được render trên trang không trước khi viết spec dựa vào nó; trạng thái huỷ quan sát qua `AgentLockBanner` biến mất.
- `e2e/` không thuộc workspace nào → lint/typecheck root không chạm tới. Nghi ngờ thì `npx tsc --noEmit --strict …` tay.
- Job CI `E2E (Playwright)` không bắt buộc; service container `mongo:7.0` + `redis:7-alpine`.

## RAG eval (`backend/src/lib/rag-eval/`)

Metric thuần (`recallAtK`, `precisionAtK`, `mrr`, `ndcgAtK`, `hitRate`, test tính tay), 5 constraint check không tốn LLM (`geoOutliers` dùng **median**, không mean), snapshot corpus offline, golden-set + CLI gán nhãn, runner offline với baseline/BM25/RRF/query rewrite có cache. Corpus thật: staging `travelplan_staging`, 26 thành phố (`npm run seed:eval-corpus` tốn Serper + Gemini thật). `Trip.generationMeta` ghi `ragUsed`/`ragResultCount`/`model`/`aiAttempts`/token/`latencyMs` mỗi lần sinh trip (chỉ ở backend model).

## Golden `abkit` (`analytics/golden/`)

`python -m abkit golden [root] [--strict]` chạy engine trên từng case và in PASS/FAIL/MISSING/ERROR theo dung sai trong `truth.json`; method chưa có implementation (đăng ký ở `abkit/golden/methods.py`) là MISSING, chỉ đỏ khi `--strict`. Đáp án G-ref tính bằng scipy/statsmodels ở `abkit/golden/ref_truth.py` (không import gì từ abkit; test AST chặn). Case đã đóng băng không sửa — đổi thì đóng băng sang `v2/` bằng `python -m abkit.golden.freeze_ref` (cần extra `[golden]`). Format và hợp đồng từng method: `analytics/golden/README.md`. G-public Hillstrom (`v2/hillstrom/`) lấy số đã công bố (Radcliffe 2008), đóng băng bằng `python -m abkit.golden.freeze_public <raw.csv>`; file gốc để ở `D:\data\b2\hillstrom.csv` (hoặc `ABKIT_HILLSTROM_CSV`), không commit — test so lại từ file gốc tự skip khi không có file (như trên CI). G-public LaLonde NSW (`v2/public/`, số Dehejia & Wahba 1999) đóng băng bằng `python -m abkit.golden.freeze_lalonde <thư mục file thô DW>` (sha256 file thô ghim trong code); file thô và Hillstrom nằm ngoài repo ở `D:/data/b2/`, test đối chiếu file thô tự skip khi không có.

G-sim (`v1/sim-*`, 50 case mô phỏng) đóng băng bằng `python -m simkit.freeze_golden` (cài simkit sau abkit): quyết định đúng lấy từ tham số cài sẵn, ước lượng đúng là hiệu ứng thật tính từ cả hai potential outcome của cùng user ảo; seed được sàng bằng readout scipy độc lập và số lần thử ghi ở `source.screening`. `--subset ci-fast` (`v1/subsets.json`) là tập con cho cổng CI; `SIMKIT_GOLDEN_FULL=1` dựng lại cả 50 case (chạy đêm).

Cổng golden (PR 15a, M10): job bắt buộc `abkit Lint + Test` chạy `abkit golden --subset ci-fast --strict`, rồi `abkit gate`. `abkit gate` cài 10 mutant ở `abkit/golden/mutants.py` vào bản copy tạm của package và chạy từng bản trong interpreter mới; mutant nào không làm đỏ ít nhất một case thì exit 1. G-event chạy qua `simkit` `tests/test_catalog.py`. Workflow `abkit-golden-nightly.yml` chạy toàn bộ case cùng `SIMKIT_GOLDEN_FULL=1`; `schedule` chỉ chạy từ `main`. Sửa engine mà đổi đúng dòng một mutant đang vá thì `test_golden_mutants.py` đỏ: dời mutant sang dòng mới, đừng xoá.

## Script đo (`backend/scripts/`, chỉ đọc trừ khi ghi khác)

| Lệnh                                                                                   | Đo                                                                                                                                                                                                                     |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run measure:false-healthy -w backend -- --simulate\|--retrospective`              | Dashboard SLO báo "healthy" sai bao lâu khi FALLBACK                                                                                                                                                                   |
| `npm run measure:pipeline -w backend -- --harvest --redis-url=<url>` rồi `-- --report` | p95/stall từ job history Redis (giới hạn bởi retention)                                                                                                                                                                |
| `npm run measure:achieved-slo -w backend`                                              | SLI/error budget thật trên `JobMetric`                                                                                                                                                                                 |
| `npm run seed:real-trip-jobs`                                                          | Load-test với Gemini + Places thật (tốn quota)                                                                                                                                                                         |
| `npm run check:services [-- --strict]`                                                 | Ping Mongo/Redis/Clerk/Gemini/Places/Mapbox                                                                                                                                                                            |
| `npm run analytics:export -w backend [-- --day=YYYY-MM-DD --out=<dir>]`                | Xuất `analytics_events` một ngày UTC (mặc định hôm qua) → `analytics/data/events/events-<day>.jsonl.gz`, id đã băm; cần cùng `ANALYTICS_HASH_SECRET` với ingest                                                        |
| `npm run seed:experiments -w backend`                                                  | Ghi catalog experiment (`packages/shared/src/constants/experiments.ts`) vào `experiments` dạng `draft`, không đụng doc đã có; bật thử nghiệm = chủ repo đổi `status` thành `running` và đặt `EXPERIMENTS_ENABLED=true` |

Load-test sạch cần Redis riêng (xem `pitfalls.md`); đối chiếu `redis-cli get bull:trip-generation:id` với số `JobMetric` để biết job có mất tích không. Reliability API gate 3 lớp: `ENABLE_RELIABILITY_API` → Clerk → `SRE_ADMIN_EMAILS`; dashboard `/reliability` cố ý không có link menu.
