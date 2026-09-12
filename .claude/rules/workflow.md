# Workflow — hub

> Quy tắc bất di bất dịch + quy ước phiên làm việc + nợ kỹ thuật. Chi tiết git flow/PR/commit và
> quy trình test nằm ở 2 file import bên dưới — sửa ở đó, không lặp lại ở đây. Debug bug qua
> trình duyệt → `.claude/rules/debug-chrome-mcp.md`.

@.claude/rules/developer-guide.md
@.claude/rules/tdd.md

## Quy tắc bất di bất dịch

1. **Mọi thay đổi đều phải qua PR.** Không bao giờ commit thẳng vào `develop` hay `main`. **Vào git worktree riêng (`EnterWorktree`) + tạo nhánh mới từ `develop` mới nhất TRƯỚC khi sửa file đầu tiên** (không phải lúc chuẩn bị commit, không code trong thư mục chính) → code → commit → push → mở PR vào `develop`. Lý do (nhiều phiên Claude Code/Cursor chạy song song có thể xoá mất việc chưa commit của nhau) + chi tiết setup: `.claude/rules/developer-guide.md` mục "Git Flow".
2. **`main` do chủ repo quản lý.** Claude không bao giờ merge vào `main` (kể cả `--admin`), không push, không tự mở PR release trừ khi được yêu cầu rõ ràng. Câu nói rộng kiểu "làm hết đi"/"merge luôn" trong hội thoại **không** tính là uỷ quyền bấm merge `main`. Nếu chủ repo tự merge, phải là merge commit thật, không squash.
3. **3 job bắt buộc xanh hết (`Lint + Unit Tests`, `Typecheck + Build`, `Backend Docker Build`) = merge ngay vào `develop`.** Không hỏi lại, không báo "CI đã xanh, có merge không?" rồi chờ, không thêm gate thủ công nào ngoài 3 job này + test local pass. Đây là hành động pre-authorize từ trước, không cần xin phép mỗi lần. CI đỏ hoặc đang chạy → không merge, đợi hoặc fix. `main` không nằm trong phạm vi này — luôn để chủ repo tự merge dù CI xanh. Chi tiết: `.claude/rules/developer-guide.md` mục "Điều kiện merge vào `develop`".
4. **TDD bắt buộc** (Red → Green → Refactor) — không commit code mới thiếu test. Chi tiết: `.claude/rules/tdd.md`.
5. **Cập nhật `CLAUDE.md` + `.claude/rules/*`** khi task làm thay đổi convention, tooling hay quy trình.
6. **Sửa bug quan sát được qua trình duyệt phải verify bằng MCP `chrome-devtools` cả trước lẫn sau khi fix** — không báo "đã fix" nếu chưa tái hiện lại thao tác gây bug sau khi sửa. Chi tiết: `.claude/rules/debug-chrome-mcp.md`.

## Phiên làm việc tự động

Áp dụng sau khi plan đã được review/duyệt (không áp dụng ở bước lập plan — plan vẫn cần duyệt trước).

1. **Thực thi liên tục tới hết plan.** Không dừng giữa chừng để hỏi các quyết định implementation nhỏ (đặt tên, cấu trúc file, chọn cách viết trong phạm vi đã duyệt) — tự quyết theo best judgement và các rule đã có (TDD, Repository Symmetry, Rule of 200...).
2. **Xong việc → mở PR → tự động theo dõi CI tới khi xong → merge vào `develop`** theo đúng rule 3 ở trên. Đây đã là hành động pre-authorize, không cần hỏi lại mỗi lần. Không được báo "đang đợi CI" rồi dừng lại im lặng — dùng `/pr` (`.claude/commands/pr.md`) để mở PR + `/ci-watch` (`.claude/commands/ci-watch.md`) hoặc `ScheduleWakeup` để tự đánh thức lại (mốc đầu 120 giây, xem `developer-guide.md` mục "Theo dõi CI sau khi mở PR") cho tới khi CI pass hoặc fail, rồi merge hoặc báo lỗi ngay.
3. **Có câu hỏi thật** (ambiguity nghiệp vụ, hành động rủi ro ngoài phạm vi đã pre-authorize như merge `main`/chạm production, thiếu thông tin quyết định được) **→ hỏi ngay lúc phát sinh** bằng `AskUserQuestion`, không đợi tới cuối phiên mới hỏi dồn.
4. **Cuối phiên**, nếu đã làm hết việc và không còn câu hỏi treo: cập nhật `CLAUDE.md`/`.claude/rules/*` nếu convention/tooling có thay đổi (rule 5 ở trên) trong cùng phiên, không đợi được nhắc.

## Nợ kỹ thuật

Bug tìm thấy khi làm task mà không thuộc phạm vi được giao → viết test khẳng định hành vi **hiện tại** (dù là bug, kèm comment `[BUG]`, xem `.claude/rules/tdd.md`), không tự sửa ngoài phạm vi. Ghi lại ngay lúc phát hiện vào `.claude/rules/tech-defaults.md` mục "Nợ kỹ thuật đã xác minh" — mỗi khoản ghi đủ ba phần, nếu không thì vô dụng khi đọc lại sau vài tuần:

- **Triệu chứng** — người dùng/hệ thống thấy gì (không phải "code xấu").
- **Nguyên nhân** — chỗ nào trong code, kèm `file:line`.
- **Điều kiện kích hoạt** — khi nào nó thành lỗi thật.

Sửa xong thì xoá khỏi danh sách trong cùng commit với bản sửa.
