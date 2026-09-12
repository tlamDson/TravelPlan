# Debug bug — verify bằng MCP `chrome-devtools`

> Chỉ đọc file này khi đang sửa 1 bug quan sát được qua trình duyệt hoặc verify 1 bước UI mới —
> task thuần logic backend không có mặt UI/network (vd logic nội bộ của một BullMQ processor)
> verify bằng test thay (xem `.claude/rules/tdd.md`).

**Ranh giới với E2E Playwright (`e2e/`):** Playwright là hồi quy tự động, chạy lại được vô hạn lần
trong CI, không cần người ngồi thao tác — dùng cho luồng nghiệp vụ đã ổn định, muốn khoá không cho
regression lặp lại (vd `e2e/create-trip.spec.ts` phủ trọn vòng đời `POST /api/trips` → poll → cancel
→ list → delete). MCP `chrome-devtools` là công cụ debug/verify TAY, dùng đúng lúc đang sửa 1 bug
cụ thể hoặc kiểm chứng 1 bước UI mới — không thay thế lẫn nhau: viết xong 1 bug fix qua
`chrome-devtools` không có nghĩa được bỏ qua việc cân nhắc thêm Playwright test nếu bug đó thuộc
luồng nghiệp vụ hay lặp lại quy trình test tay tốn nhiều bước (vd `e2e/wizard-navigation.spec.ts`,
`e2e/wizard-paywall.spec.ts`).

Bug quan sát được qua trình duyệt (lỗi UI, lỗi hành vi frontend, hoặc lỗi backend chỉ lộ ra khi
thao tác trên web app TravelPlan) **bắt buộc** dùng MCP `chrome-devtools` (khai ở `.mcp.json`,
xem bảng MCP Servers trong `CLAUDE.md`) ở cả hai đầu:

1. **Trước khi sửa — tái hiện bug thật:** mở đúng trang bằng `navigate_page` (vd `http://localhost:5173/trips/:tripId`), thao tác lại đúng bước gây lỗi, xác nhận bug bằng ít nhất một trong `take_screenshot` / `take_snapshot` / `list_console_messages` / `list_network_requests`. Đừng suy đoán nguyên nhân chỉ từ đọc code — quan sát trạng thái thật trước.
2. **Sau khi sửa — verify lại, không tự cho là xong:** lặp lại đúng thao tác đã gây bug ở bước 1 trên trang đã có fix, xác nhận lỗi hết (console sạch, network đúng response, UI đúng như kỳ vọng) trước khi báo hoàn thành hoặc mở PR.
3. Nhóm tool đọc (`screenshot`, `snapshot`, `console`, `network`) auto-allow trên `chrome-devtools`; `navigate_page` / `click` / gõ phím / `evaluate_script` vẫn hỏi xác nhận từng lần — cứ gọi bình thường, đợi user duyệt.
4. Bug không thể quan sát qua trình duyệt (thuần backend, không có mặt UI/network quan sát được — ví dụ logic nội bộ của một BullMQ processor) thì verify bằng test (TDD, `.claude/rules/tdd.md`) thay vì `chrome-devtools`.

Việc verify này là bắt buộc, không phải tuỳ chọn — không báo "đã fix" nếu chưa tái hiện lại thao tác gây bug bằng `chrome-devtools` sau khi sửa.
