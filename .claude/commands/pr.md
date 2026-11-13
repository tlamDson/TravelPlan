---
description: Commit, push, open a PR into develop, then hold the turn until CI concludes
argument-hint: [pr title]
allowed-tools: Bash(git status *), Bash(git diff *), Bash(git log *), Bash(git branch *), Bash(git rev-parse *), Bash(git checkout -b *), Bash(git add *), Bash(git commit *), Bash(git push *), Bash(gh pr create *), Bash(gh pr view *), Bash(gh pr checks *), Bash(gh pr merge *), Bash(gh run list *), Bash(gh run view *), Read, Write, Edit
---

Lệnh tuỳ chọn cho **phiên tay** — phiên headless của conductor không dùng lệnh này (dừng ở push, xem `CLAUDE.md` mục "Hai loại phiên").

Bạn đang thực thi quy trình mở PR đầy đủ cho TravelPlan, theo `.claude/rules/git-pr.md`. Làm tuần tự, không hỏi lại người dùng trừ khi bị chặn cứng (auth thiếu, conflict không tự giải quyết được).

## 1. Preflight

`gh auth status` — nếu chưa login, dừng ngay và báo rõ lý do, không cố tiếp.
`git status --porcelain` và `git rev-parse --abbrev-ref HEAD` để biết đang ở đâu.

## 2. Branch

Nếu đang ở `main` hoặc `develop`, tạo branch mới từ `develop` hiện tại (không phải `main`):

```
git checkout -b <type>/<kebab-case-description>
```

`<type>` một trong `feature/fix/test/docs/chore`, suy từ nội dung thay đổi hoặc từ `$ARGUMENTS`. Không bao giờ commit thẳng vào `develop`/`main`.

## 3. Commit

Chỉ `git add` đúng những file liên quan tới thay đổi thật (không dùng `git add -A` tuỳ tiện nếu có file lạ không rõ nguồn gốc trong working tree — kiểm `git status` trước). Review bằng `git diff --cached --stat`. Commit theo convention ở `.claude/rules/git-pr.md`: imperative mood, một dòng, không prefix `feat:`/`fix:`. Kết thúc message bằng trailer:

```
Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
```

## 4. Push

```
git push -u origin <branch>
```

## 5. Tạo PR

```
gh pr create --base develop --title "<type>: <mô tả ngắn>" --body "..."
```

Body theo template PR trong `.claude/rules/git-pr.md` (Summary + RED + Test plan + Assumptions). Thêm footer `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Lấy số PR từ URL trả về.

## 6. Arm guard — bước này BẮT BUỘC làm trước khi chờ

Ghi file `.claude/.ci-watch.json`:

```json
{ "pr": <n>, "branch": "<branch>", "armed_at_epoch": <unix now>, "deadline_epoch": <now + 3600>, "attempts": 0, "max_attempts": 6, "last_status": "pending" }
```

## 7. Chờ check đăng ký

```bash
n=0
until [ "$(gh pr view <n> --json statusCheckRollup --jq '.statusCheckRollup|length')" -ge 2 ] || [ $n -ge 36 ]; do
  n=$((n+1)); sleep 5
done
```

## 8. Watch có giới hạn — KHÔNG kết thúc lượt giữa các vòng

Bash tool, timeout 540000 (9 phút):

```bash
gh pr checks <n> --watch --fail-fast --interval 20 >/dev/null 2>&1
echo "watch_exit=$?"
gh pr checks <n> --json bucket,name,state,link --jq '.[] | "\(.bucket)\t\(.name)\t\(.link)"' || true
```

Nếu timeout, gọi lại đúng lệnh này (tối đa 5 vòng ≈ 45 phút). Không dừng lượt giữa các vòng gọi.

## 9. Phân loại

```bash
gh pr checks <n> --json bucket --jq 'if any(.[]; .bucket=="pending") then "PENDING" elif any(.[]; .bucket=="fail" or .bucket=="cancel") then "FAILED" else "PASSED" end'
```

## 10. Nếu FAILED

```bash
gh run list --branch <branch> --workflow "CI - PR Check" --limit 1 --json databaseId,conclusion
gh run view <id> --log-failed
```

Chẩn đoán, sửa, commit, push, quay lại bước 7 (guard vẫn đang armed, không cần arm lại).

## 11. Nếu PASSED hoặc hết deadline

Xoá `.claude/.ci-watch.json`. Nếu PASSED và PR target là `develop`: merge (`gh pr merge <n> --squash`) chỉ khi đã có review độc lập PASS (luật quyền trong `CLAUDE.md`); chưa có review thì báo cáo PR sẵn sàng chờ review. Nếu PR target là `main`: **không bao giờ tự merge**, chỉ báo cáo PR đã sẵn sàng để chủ repo tự quyết định. Nếu hết deadline mà chưa PASSED thì không merge — báo cáo trạng thái. Luôn báo cáo: PR URL, bảng check (tên + bucket), kết quả merge (đã merge / để chủ repo tự merge), và nhắc rõ **lint/test hiện đã thật sự chặn CI** (không còn `|| echo`) nên xanh nghĩa là test pass thật.

## 12. Nếu hết deadline mà vẫn PENDING

Disarm, rồi arm lại dưới dạng background task (`run_in_background: true` trên `gh pr checks <n> --watch`) để người dùng vẫn được báo khi xong, và nói rõ đã chuyển sang chế độ nền.

⚠️ Không interpolate `$ARGUMENTS` vào block `` !`…` `` — không được shell-escape, truyền dưới dạng prose để dùng trong Bash tool call.
