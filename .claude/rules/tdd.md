# TDD — Red → Green → Refactor

1. **RED** — viết test trước, commit đầu tiên chỉ chứa test. Chạy, xác nhận đỏ đúng lý do (assertion fail hoặc import chưa tồn tại — không phải lỗi cấu hình). Giữ output đỏ cho mục `## RED` của PR.
2. **GREEN** — code tối thiểu để pass; không thêm logic chưa có test phủ.
3. **REFACTOR** — dọn, chạy lại test liên quan, không được vỡ.

## Đặt test ở đâu

| Loại                | Vị trí                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------- |
| Backend unit        | `backend/src/features/<domain>/**/<name>.test.ts`                                                             |
| Backend integration | `backend/src/test/integration/<name>.integration.test.ts`                                                     |
| Frontend            | `frontend/web/src/features/<domain>/__tests__/<Name>.test.tsx` (hoặc `hooks/__tests__/`, `stores/__tests__/`) |
| Shared              | `packages/shared/src/schemas/__tests__/`                                                                      |
| Python              | `analytics/<pkg>/tests/test_<name>.py`, `services/<svc>/tests/`                                               |

## Quy ước

- Unit: mock repository/queue bằng `vi.mock()`; không bao giờ gọi Gemini/Places/Mapbox thật — dùng fixture ở `backend/src/test/fixtures/`.
- Integration: Mongo/Redis thật qua `supertest` + `createApp()`; auth qua stub `@clerk/express` có sẵn (header `x-test-user-id`). Route mới, hoặc route rẽ nhánh theo state/permission/tier, bắt buộc có integration test. DB `travelplan_test` dùng chung — chỉ chạy file integration mình sửa, và chỉ khi `docker compose` đã bật `mongodb` + `redis`.
- Frontend: mock API bằng MSW; component gọi API render qua `renderWithProviders`, hook qua `renderHookWithQuery`.
- Timer/polling: `vi.useFakeTimers()` + `await vi.advanceTimersByTimeAsync(ms)`, `vi.useRealTimers()` trong `afterEach`.
- Test độc lập, assertion theo hành vi cụ thể (không `toBeTruthy()` mơ hồ). Không `test.skip` mà không ghi lý do. Coverage ≥ 80% cho file mới.
- Bug ngoài phạm vi: test khẳng định hành vi hiện tại kèm comment `[BUG]`, ghi vào `.claude/reference/tech-debt.md`.
