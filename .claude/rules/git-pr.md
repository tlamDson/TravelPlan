# Git, commit, PR

## Nhánh và worktree

`develop ← <type>/<mô-tả> (PR)`, `main ← develop` (release theo điều lệ quyền). Nhánh luôn tạo từ `origin/develop` mới nhất. Loại nhánh: `feature/`, `fix/`, `test/`, `docs/`, `chore/` — chữ thường, kebab-case, mô tả cụ thể (không `fix/bug`, `feature/wip`).

Mỗi việc một worktree riêng (nhiều phiên chạy song song trên cùng repo; dùng chung thư mục thì `git checkout`/`reset` của phiên này xoá mất thay đổi chưa commit của phiên kia). Phiên headless đã được giao worktree sẵn. Phiên tay: `EnterWorktree` trước khi sửa file đầu tiên, rồi:

```bash
git fetch origin develop
git reset --hard origin/develop
git branch -m <type>/<mô-tả>
```

Worktree mới không có `.env` và `node_modules`: copy `.env`, `backend/.env`, `frontend/web/.env` (và `.env.e2e` nếu chạm E2E) từ thư mục chính, rồi `npm install`. Dev server trong worktree dùng cổng khác thư mục chính. Không dùng `git stash` trần (stack dùng chung giữa các worktree) — dùng commit WIP tạm.

## Commit

Một dòng, imperative, hoàn thành câu "If applied, this commit will…". Không prefix `feat:`/`fix:` (chỉ dành cho title PR). Verb: `add`, `fix`, `update`, `remove`, `refactor`, `test`, `docs`, `chore`. Không commit `.env`/secret, `node_modules/`, `dist/`, coverage, file ngoài phạm vi việc.

## Pull request

Target `develop`. Title `<type>: <mô tả ngắn>` (< 72 ký tự; `feat|fix|test|docs|chore|refactor`). Body:

```markdown
## Summary

- <thay đổi chính, lý do>

## RED

<output test đỏ của commit đầu tiên>

## Test plan

- [ ] Commit đầu chỉ có test đỏ (TDD)
- [ ] Test liên quan pass; `npm run lint`, `npm run typecheck` pass
- [ ] No `.env` or secrets committed

## Assumptions

- <quyết định nhỏ đã tự chọn; điều thấy ngoài phạm vi, không sửa>
```

Trước khi push thêm commit vào PR đã mở: `gh pr view <n> --json state` — PR đã `MERGED`/`CLOSED` thì không có CI mới, mở nhánh mới từ `develop`.

## CI (`.github/workflows/ci-pr.yml`)

Tên 3 job `Lint + Unit Tests`, `Typecheck + Build`, `Backend Docker Build` **là** tên required check trên GitHub:

- Không đổi tên; cần việc mới thì thêm job tên khác.
- Không thêm `paths:` vào `on: pull_request` (check treo ở "Expected", PR không merge được).
- Không đặt `if:` cấp job cho 3 job này — gate ở cấp step (mẫu `changes` + `env.SHOULD_BUILD`).
- Thấy `|| echo` bọc lint/test là có người đang vô hiệu hoá gate — hỏi trước khi giữ.
- Job `abkit Lint + Test` (Python `analytics/abkit`, B2) giữ cùng luật như 3 job trên: không đổi tên, không `if:` cấp job. Plan B2 đưa nó vào required checks — việc đó là của chủ repo (branch protection).
- Job phụ (`security`, `e2e`, …) được phép đỏ; không tự thêm vào required checks.
