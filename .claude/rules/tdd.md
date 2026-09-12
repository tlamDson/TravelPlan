# TDD (Red → Green → Refactor) — bắt buộc cho mọi feature/fix

> Nguồn duy nhất cho quy trình test của TravelPlan. Chi tiết hạ tầng test đầy đủ (4 lớp, setup
> Mongo/Redis/Playwright, cạm bẫy) nằm ở `.claude/rules/tech-defaults.md` mục "Hạ tầng test" — file
> này chỉ nói **quy trình**, không lặp lại chi tiết setup.

1. **RED** — viết test fail trước, chưa viết implementation. Backend unit: `backend/src/features/<domain>/**/<name>.test.ts`. Backend integration: `backend/src/test/integration/<name>.integration.test.ts` (chỉ khi cần verify qua HTTP thật với Mongo/Redis thật). Frontend: `frontend/web/src/features/<domain>/__tests__/<Component>.test.tsx` (hoặc `hooks/__tests__/`, `stores/__tests__/` tuỳ vị trí file gốc). Xác nhận thấy đỏ thật (assertion fail hoặc import error đúng nghĩa, **không phải lỗi cấu hình**) trước khi tiếp tục.
2. **GREEN** — code tối thiểu để pass, không thêm logic chưa có test bao phủ.
3. **REFACTOR** — cải thiện code, chạy lại toàn bộ test, không được break.

```bash
# Toàn repo
npm run test

# Backend unit
npm run test -w backend
npm run test -w backend -- --watch

# Backend integration (cần docker compose up -d mongodb redis trước)
npm run test:integration -w backend

# Frontend
npm run test -w frontend/web

# E2E (4 spec CI-safe — cần .env.e2e local hoặc GH secrets trên CI)
npm run e2e
npm run e2e -- --ui
```

## Bốn lớp test — tóm tắt, chi tiết ở `tech-defaults.md`

- **Shared + backend unit** — mock repository layer bằng `vi.mock()`, không dùng Mongo thật. Mock `bullmq` và chạy processor đồng bộ. **Không bao giờ** gọi API AI/Mapbox/Google Places thật — dùng golden fixture ở `backend/src/test/fixtures/` (`valid-trip.json`, `malformed-trip.json`, `empty-results.json`).
- **Backend integration** — ngược lại, dùng Mongo/Redis/BullMQ **thật** qua `supertest` + `createApp()` (`backend/src/app.ts`). Auth giả lập tự động qua stub `@clerk/express` (alias trong `vitest.integration.config.ts`), không cần `vi.mock()` riêng lẻ.
- **Frontend unit/component** — mock API bằng MSW (`http`/`HttpResponse` từ `msw`), không mock module trực tiếp nếu MSW đủ dùng. Component gọi API phải render trong `AppProviders` (QueryClient + Clerk + Router) — dùng `frontend/web/src/test/renderWithProviders.tsx` (component) hoặc `renderHookWithQuery.tsx` (hook) thay cho `render()`/`renderHook()` trần.
- **E2E Playwright** — trình duyệt thật lái qua UI thật, DB cô lập `travelplan_e2e` (drop mỗi run). Auth thật qua Clerk Backend API (không qua UI). Dùng cho hồi quy tự động, lặp lại được vô hạn trong CI. **Ranh giới với `chrome-devtools` MCP** (xem `.claude/rules/debug-chrome-mcp.md`): Playwright khoá luồng nghiệp vụ đã ổn định muốn tránh regression lặp lại (vd `create-trip.spec.ts`); `chrome-devtools` là công cụ debug/verify TAY cho 1 bug cụ thể hoặc 1 bước UI mới đang làm — không thay thế lẫn nhau.

## Quy ước bổ sung

- Test timer (polling job status, exponential backoff): `vi.useFakeTimers()` + `await vi.advanceTimersByTimeAsync(ms)`; nhớ `vi.useRealTimers()` trong `afterEach`. Khi cần cả fake timer lẫn `userEvent`, dùng `userEvent.setup({ advanceTimers: vi.advanceTimersByTime })` — trộn `waitFor()` với fake timer dễ deadlock.
- Zustand store không có `reset()` riêng thì snapshot state ban đầu (`const INITIAL = useXStore.getState()`) rồi `useXStore.setState(INITIAL, true)` trong `beforeEach`.
- Test đụng Radix Popover/Select/cmdk cần polyfill `ResizeObserver`/`scrollIntoView` — đã có sẵn trong `frontend/web/src/test/setup.ts`, không cần thêm lại.
- Bug tìm thấy khi viết test mà không thuộc phạm vi task hiện tại → viết test khẳng định hành vi **hiện tại** (dù là bug) kèm comment `[BUG]` giải thích, không tự sửa ngoài phạm vi được giao. Ghi lại vào `.claude/rules/tech-defaults.md` mục "Nợ kỹ thuật đã xác minh" theo format 3 phần ở `.claude/rules/workflow.md` mục "Nợ kỹ thuật".
- Route mới hoặc route có nhánh rẽ theo loại dữ liệu (state machine, permission, tier) **bắt buộc có integration test**, không chỉ unit test cho hàm thuần bên dưới — đúng bài học rút ra khi mở rộng coverage từ ~4 lên ~30 route (xem `tech-defaults.md`).

Coverage >= 80% cho file mới. Test độc lập (reset state trong `beforeEach`/`afterEach`), assertion cụ thể theo hành vi. Không skip test bằng `test.skip` mà không giải thích lý do. Không commit code mới thiếu test.
