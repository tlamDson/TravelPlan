# Developer Guide — Git Flow, Worktree, Commit, PR

> Quy ước đóng góp code cho TravelPlan. Quy trình test đầy đủ nằm ở `.claude/rules/tdd.md`, debug
> qua trình duyệt nằm ở `.claude/rules/debug-chrome-mcp.md` — sửa ở đó, không lặp lại ở đây.

## Git Flow

`develop ← <type>/<mô-tả> (PR)`, `main ← develop (PR, chỉ chủ repo merge)`. Không bao giờ push thẳng lên `develop` hay `main`. Luôn tạo nhánh mới từ `develop` mới nhất.

**Mọi task bắt buộc làm trong git worktree riêng — không code trực tiếp trong thư mục chính.**
Nhiều phiên Claude Code (hoặc Claude Code + Cursor) chạy song song trên cùng repo là chuyện bình
thường. Nếu các phiên dùng chung một thư mục, `git checkout`/`git reset` của phiên này âm thầm xoá
thay đổi CHƯA COMMIT của phiên kia, không báo lỗi gì. Worktree cho mỗi task một thư mục vật lý
riêng nên các phiên không thể đụng file của nhau nữa (PR conflict giữa hai nhánh _đã commit_ thì
vẫn bình thường, resolve như mọi git conflict khác).

Gọi `EnterWorktree` **trước khi sửa file đầu tiên**, không phải lúc chuẩn bị commit. `EnterWorktree`
mặc định branch từ `origin/main` (repo này git flow từ `develop`, xa `main` nhiều commit) nên sau
khi vào worktree phải tự đưa nhánh về đúng gốc:

```bash
git fetch origin develop
git reset --hard origin/develop
git branch -m <type>/<mô-tả-kebab-case>
```

Worktree mới không có `node_modules`/`.env`: copy `.env`, `backend/.env`, `frontend/web/.env`
(và `.env.e2e` ở root nếu chạm E2E) từ thư mục chính, rồi `npm install` một lần trước khi chạy dev
server/test/lint — monorepo 4 workspace + Playwright nên bước này có thể nặng, chấp nhận đánh đổi
để không mất edit chưa commit của phiên khác. Nếu cần chạy dev server để verify UI bằng
`chrome-devtools` MCP, chọn cổng khác với thư mục chính đang dùng (mặc định 3000/5173 có thể đã bị
chiếm).

Không dùng Claude Code thì `git worktree add ../<tên> -b <type>/<mô-tả> develop` đạt cùng hiệu quả.

**Branch types:** `feature/`, `fix/`, `test/`, `docs/`, `chore/`. Chữ thường, phân tách bằng `-`, mô tả cụ thể phạm vi (không dùng `feature/update`, `fix/bug`, `feature/wip`). Ghi rõ module/trang liên quan khi có thể: `feature/destination-picker-search`, `fix/trip-detail-drag-drop`.

## Versioning

Số version sống ở root `package.json` — đây là nguồn sự thật duy nhất. 5 chỗ còn lại phải mirror theo mỗi lần bump: `backend/package.json`, `packages/shared/package.json`, `frontend/mobile/package.json`, `frontend/web/package.json`, và `backend/src/app.ts`'s Swagger `info.version` (lộ ra ở `/api/docs`, dễ bỏ sót vì không nằm trong package.json nào). Tag release dạng `v<version>` (vd `v0.1.0`), gắn trên `main` sau khi `develop → main` merge — theo mục "Merge policy" ở dưới, chỉ chủ repo merge/tag.

## Commit Messages

Imperative mood, hoàn thành câu _"If applied, this commit will… [message]"_. Một dòng, không dùng prefix `feat:`/`fix:` (prefix đó chỉ dành cho PR title).

Verb chuẩn: `add`, `fix`, `update`, `remove`, `refactor`, `test`, `docs`, `chore`.

```
add unit test for trip status idempotency
fix itinerary clustering duplicate place bug
update wizard destination picker empty state copy
```

Không dùng: `fix bug`, `update code`, `WIP`, `added stuff`, past tense (`Fixed login`), hay prefix `feat:` trong commit.

Không commit: `.env`/credentials/tokens, `node_modules/`, `dist/`, coverage reports, file không liên quan task.

## Pull Requests

Target mặc định là `develop` (chỉ target `main` khi release, từ `develop`). Title format `<type>: <short description>` (< 72 ký tự): `feat:`, `fix:`, `test:`, `docs:`, `chore:`, `refactor:`.

PR description dùng template:

```markdown
## Summary

- <thay đổi chính>
- <lý do / impact>

## Test plan

- [ ] Unit tests added/updated (TDD: RED → GREEN)
- [ ] `npm run test` pass locally
- [ ] `npm run typecheck` và `npm run build` pass locally
- [ ] No `.env` or secrets committed
```

Trước khi đề xuất merge, tự verify: nhánh tạo từ `develop` mới nhất, commit message đúng convention, có test cho logic mới, không hardcode secrets, PR target đúng branch. CI check bắt buộc: `Lint + Unit Tests`, `Typecheck + Build`, `Backend Docker Build`.

### Điều kiện merge vào `develop`

| Target    | Ai merge                                                                     | Điều kiện                                                                                                                                                                                                                  |
| --------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `develop` | **Claude tự merge ngay, không hỏi lại**                                      | **Cả 3 job bắt buộc xanh** (`Lint + Unit Tests`, `Typecheck + Build`, `Backend Docker Build`) + toàn bộ test local pass. CI đỏ/đang chạy → đợi, không merge. Không có gate thủ công nào khác — 3 job xanh là điều kiện đủ. |
| `main`    | **Chỉ chủ repo** — kể cả khi được nói "làm hết"/"merge luôn" trong hội thoại | Claude không bao giờ bấm merge (kể cả `--admin`), không push, không tự mở PR release trừ khi được yêu cầu rõ ràng. Merge commit thật, **không squash** — giữ nguyên lịch sử `develop`.                                     |

Kiểm tra CI trước khi merge:

```bash
gh pr checks <PR-number>          # xem trạng thái từng check
gh pr merge <PR-number> --squash  # CHỈ dùng cho PR target develop, sau khi cả 3 check bắt buộc xanh — merge ngay, không hỏi lại
# PR target main: Claude KHÔNG chạy gh pr merge dưới bất kỳ flag nào — chuẩn bị xong rồi dừng, để chủ repo tự bấm merge (merge commit thật, không squash).
```

> `gh` có thể chưa được auth trên máy khác. Khi đó dùng GitHub MCP server, hoặc gọi thẳng REST API bằng token.

### Theo dõi CI sau khi mở PR

Mặc định: ngay sau khi mở PR, dùng `ScheduleWakeup` để tự đánh thức lại sau **120 giây** rồi check `gh pr checks <PR-number>` — không giữ turn chờ đồng bộ và không để user tự check tay. Pipeline `ci-pr.yml` hiện tại mất khoảng 2-3 phút để chạy xong cả 3 job bắt buộc; mốc 120s là ước lượng ban đầu, nếu CI chưa xong thì `ScheduleWakeup` lại một vòng nữa thay vì báo sai. Điều chỉnh lại con số này khi có dữ liệu thời gian chạy thực tế. Skill `ci-watch` (`.claude/commands/ci-watch.md`) và `/pr` (`.claude/commands/pr.md`) tự động hoá đúng vòng lặp này.

**Trước khi push thêm commit vào một PR đã mở**, luôn `gh pr view <PR-number> --json state,mergedAt` trước — nếu `state` đã `MERGED`/`CLOSED` thì push đó **không** trigger CI mới (`ci-pr.yml` chỉ chạy trên event `pull_request`, PR đóng thì không có `synchronize`). Tạo nhánh mới (trong worktree mới) từ `develop` mới nhất cho phần việc còn lại thay vì push vào branch đã merged rồi ngồi chờ CI không bao giờ tới.

### Sửa `ci-pr.yml` — đừng làm mất required check

Tên ba job trong `.github/workflows/ci-pr.yml` **chính là** định danh required status check phía GitHub. Vì vậy:

- **Không đổi tên** `Lint + Unit Tests` / `Typecheck + Build` / `Backend Docker Build`. Cần tách việc thì thêm job mới tên khác.
- **Không thêm `paths:` vào `on: pull_request`** — workflow sẽ không chạy, check treo ở _Expected_ vĩnh viễn và PR **không merge được**.
- **Không đặt `if:` ở cấp job** cho ba job này. Muốn bỏ qua việc nặng thì gate ở cấp **step**, để job vẫn chạy và vẫn kết thúc Success.

Mẫu đang dùng: job `changes` (`dorny/paths-filter`) xuất `outputs.backend`; job `docker` đặt `env.SHOULD_BUILD` rồi gắn `if: env.SHOULD_BUILD == 'true'` lên từng step build, kèm một step `echo` cho nhánh còn lại. PR target `main` (release) luôn build thật, không tin vào filter.

Job phụ không-bắt-buộc (`security`, `e2e`) đứng ngoài ba job trên, được phép đỏ mà không chặn merge — nhưng **đừng tự ý thêm chúng vào branch protection required checks**, kể cả khi thấy chúng đã ổn định lâu.
