# Debug bug qua trình duyệt (`chrome-devtools` MCP)

Áp dụng khi sửa bug quan sát được qua trình duyệt (UI, hành vi frontend, lỗi backend chỉ lộ ra khi thao tác trên web app). Bug thuần backend không có mặt UI/network thì verify bằng test.

1. **Trước khi sửa — tái hiện:** `navigate_page` tới đúng trang (vd `http://localhost:5173/trips/:tripId`), làm lại đúng thao tác gây lỗi, xác nhận bằng ít nhất một trong `take_screenshot` / `take_snapshot` / `list_console_messages` / `list_network_requests`. Quan sát trước, đừng suy nguyên nhân chỉ từ đọc code.
2. **Sau khi sửa — verify lại:** lặp đúng thao tác ở bước 1, xác nhận console sạch, network đúng, UI đúng. Chưa làm bước này thì không báo "đã fix".
3. Tool đọc (`screenshot`, `snapshot`, `console`, `network`) auto-allow; `navigate_page`, `click`, gõ phím, `evaluate_script` hỏi xác nhận từng lần.

Dev server trong worktree dùng cổng khác thư mục chính (mặc định 3000/5173 có thể đã bị chiếm).

**Đăng nhập không cần mật khẩu:** `clerk impersonate <email> --print` (Clerk CLI, `npm install -g clerk`, đã link app TravelPlan) lấy `__clerk_ticket`, rồi `evaluate_script`: `window.Clerk.client.signIn.create({ strategy: "ticket", ticket })`. Dùng để verify trang có gate (vd `/reliability` cần tài khoản trong `SRE_ADMIN_EMAILS`).

**Ranh giới với Playwright:** `chrome-devtools` là verify tay cho một bug/bước UI cụ thể; Playwright (`e2e/`) khoá luồng nghiệp vụ đã ổn định khỏi regression. Sửa xong một bug thuộc luồng hay lặp lại thì cân nhắc thêm spec E2E.
