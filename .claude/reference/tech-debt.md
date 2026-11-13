# Nợ kỹ thuật đã xác minh

Không tự sửa khi chưa được giao. Mỗi mục đủ 3 phần: **triệu chứng**, **nguyên nhân** (`file:line`), **điều kiện kích hoạt**. Sửa xong thì xoá mục trong cùng commit. Số dòng có thể lệch theo thời gian — grep theo tên hàm.

## Backend

- **`intent-parser.service.ts`'s `extractJson()` hỏng với JSON array trần**
  - Triệu chứng: response AI dạng array không bọc code fence bị cắt sai, parse fail, rơi vào retry/fallback.
  - Nguyên nhân: `backend/src/features/planner/services/intent-parser.service.ts:61` — nhánh fallback chỉ cắt theo `{`…`}`, dù `coerceRoot()` có nhánh xử lý array.
  - Kích hoạt: Gemini trả array trần không có ` ```json `.
- **`activity-regen.service.ts`'s `recalcDayDistances()` trả 500 khi activity thiếu toạ độ**
  - Triệu chứng: `PATCH /trips/:id/reorder-activities` hoặc `POST /trips/:id/regen-activity` trả 500 (`CastError` khi `Trip.save()`).
  - Nguyên nhân: `backend/src/features/planner/services/activity-regen.service.ts:47` — guard coi `coordinates: []` là có toạ độ (`[]` truthy); Mongoose tự set mảng rỗng → `validateDistance()` ra `NaN`.
  - Kích hoạt: `validationService` không tìm được toạ độ cho activity thay thế. Test: `trip-activities.integration.test.ts`.
- **`redis-options.ts` bỏ qua db-index của `REDIS_URL`**
  - Triệu chứng: `redis://host:6379/1` nối vào db 0.
  - Nguyên nhân: `backend/src/lib/redis-options.ts:44` — `buildRedisConnectionOptions()` không đọc `u.pathname`.
  - Kích hoạt: muốn cô lập môi trường bằng db-index trên cùng Redis (vd E2E/load-test cạnh dev). Test: `redis-options.test.ts` (`[BUG] REDIS_URL db-index is dropped`).
- **`job-outcome.ts`'s `normalizeFailureReason()` map lỗi phổ biến nhất thành `UNKNOWN`**
  - Triệu chứng: breakdown lỗi trên `/reliability` không tách được "AI cạn quota" khỏi "AI hỏng thật".
  - Nguyên nhân: `backend/src/features/reliability/services/job-outcome.ts:55` — `FAILURE_PATTERNS` không khớp `"AI failed to generate valid intents after 4 attempts"`; `ai-agent.service.ts` re-throw mà bỏ chuỗi gốc (chứa "429"/"quota").
  - Kích hoạt: quota Gemini cạn khiến `generateIntents()` hết retry. Test: `job-outcome.test.ts` (`[BUG] maps the real 'AI failed…'`).
- **`trip.processor.ts` (~450 dòng) và `ai-agent.service.ts` (~330 dòng) trộn nhiều trách nhiệm**
  - Triệu chứng: khó test riêng từng bước pipeline; sửa một bước dễ chạm bước khác.
  - Nguyên nhân: `backend/src/features/planner/jobs/trip.processor.ts`, `backend/src/features/planner/services/ai-agent.service.ts`.
  - Kích hoạt: mọi thay đổi pipeline sinh trip. Tách theo mẫu đã làm cho `trip.controller.ts` (7 file theo use case) nếu được giao.
- **Nhiều `any` ở backend**, phần lớn `catch (error: any)` (ESLint đang để warn, xem `backend/eslint.config.mjs`). Kích hoạt: lỗi type bị che khi refactor.

## Frontend

- **`LatencyChart.tsx` vẽ bar chart rỗng ở lần load đầu của `/reliability`**
  - Triệu chứng: trục, legend, `ReferenceLine` đúng nhưng 9 `<Bar>` cao 0px; console Recharts `"width(-1) and height(-1)…"`. Resize viewport thì bar hiện ra.
  - Nguyên nhân (nghi vấn): `frontend/web/src/features/reliability/components/LatencyChart.tsx:73` — `ResponsiveContainer` đo trước khi layout cha ổn định, animation mount cache chiều cao 0.
  - Kích hoạt: mở trang với dữ liệu latency thật. Không tái hiện được trong jsdom (polyfill `ResizeObserver` chỉ là stub) — verify bằng `chrome-devtools`.
- **19 component shadcn trong `frontend/web/src/components/ui/` chưa được import** (accordion, breadcrumb, carousel, chart, table, tabs, sheet, sidebar, menubar, drawer, pagination, scroll-area, collapsible, context-menu, hover-card, input-otp, navigation-menu, aspect-ratio, resizeable). Cố ý giữ; đừng `npx shadcn add` thêm nếu chưa dùng ngay.

## Hạ tầng

- **Redis production chỉ giữ lịch sử job theo `DEFAULT_JOB_RETENTION`** (complete 7 ngày, fail 30 ngày) — `measure-pipeline.ts --harvest` không đo được gì cũ hơn cửa sổ đó. Nguồn lâu dài là `Trip.generationMeta`/`JobMetric` trong Mongo.
- **Code reliability (`backend/src/features/reliability/`) chưa lên `main`** tại lần kiểm cuối — production chưa ghi `JobMetric`; kiểm lại bằng `git ls-tree origin/main backend/src/features/reliability`.

## Đã kiểm, không phải bug (đừng điều tra lại)

- `PATCH /api/users/me` với `{ tier: "pro" }` không nâng cấp được user — Zod `updateUserSchema` strip field lạ (`users.integration.test.ts`).
- `budget-validator.service.ts`'s `convertToUSD` nhân với tỷ giá **có vẻ đúng**: bảng `rates` là USD trên một đơn vị ngoại tệ (JPY `0.0067`, 3000 JPY ≈ $20). Test `budget-validator.service.test.ts`'s `[BUG #8]` vẫn gọi đây là bug — cần người quyết trước khi "sửa" chiều quy đổi.
