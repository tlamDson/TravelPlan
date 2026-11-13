---
description: Watch CI on an existing PR without stopping the turn until it concludes, or stop watching
argument-hint: [pr-number|stop]
allowed-tools: Bash(gh pr view *), Bash(gh pr checks *), Bash(gh pr merge *), Bash(gh run list *), Bash(gh run view *), Bash(git rev-parse *), Bash(git branch *), Read, Write
---

Lệnh tuỳ chọn cho **phiên tay**; phiên headless của conductor không dùng.

Nếu `$1` là `stop`: xoá `.claude/.ci-watch.json` nếu tồn tại, báo đã disarm, dừng ở đây.

Ngược lại, resolve PR: dùng `$1` nếu là số, ngược lại `gh pr view --json number --jq .number` cho branch hiện tại. Nếu không tìm được PR nào, báo rõ và dừng.

Ghi `.claude/.ci-watch.json` với `pr`, `branch` (từ `git rev-parse --abbrev-ref HEAD`), `armed_at_epoch` = now, `deadline_epoch` = now + 3600, `attempts: 0`, `max_attempts: 6`.

Sau đó thực hiện đúng bước 7–12 của `/pr` (chờ check đăng ký → watch có giới hạn → phân loại → xử lý fail/pass/timeout). Khi PASSED: kiểm `gh pr view <n> --json baseRefName` — nếu base là `develop` thì merge (`gh pr merge <n> --squash`) chỉ khi đã có review độc lập PASS, chưa có thì báo cáo sẵn sàng chờ review; nếu base là `main` thì không bao giờ tự merge, chỉ báo cáo sẵn sàng.
