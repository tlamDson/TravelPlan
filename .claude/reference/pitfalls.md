# Cạm bẫy đã trả giá

Đọc khi đụng tới vùng tương ứng. Cạm bẫy về Railway/Vercel/GCP nằm ở `deploy-ops.md`; về test/E2E ở `test-infra.md`.

## Backend, BullMQ, Redis

- **Bug "IDLE":** với priority queue, job vào state BullMQ `"prioritized"` chứ không phải `"waiting"`. `JOB_STATE_TO_STATUS` phải map `prioritized → "QUEUED"`, nếu không UI báo 0% IDLE dù job đang chạy.
- **BullMQ `removeOnComplete` làm job thành công biến mất:** `getJobCounts()` không phân biệt job đã xong với job chưa từng chạy. Muốn biết cái gì đã xong thì tra **kết quả** (document đã ghi), không tra hàng đợi. Re-add cùng `jobId` với job đang `failed` không tự retry — `job.remove()` trước rồi `queue.add()`.
- **Lock BullMQ:** lock renewal là timer chạy mỗi `lockDuration/2`, job `await` dài không bao giờ stall; chỉ code đồng bộ chặn event loop lâu hơn lock mới stall. Lock dài chỉ làm recovery khi worker crash chậm hơn. Worker dùng default BullMQ (đã bỏ `lockDuration: 60s`).
- **ioredis nuốt nguyên nhân:** `connect()` reject với `"Connection is closed."`, lỗi thật (`ECONNREFUSED`, `ENOTFOUND`, `NOAUTH`) chỉ ra qua event `"error"`. Luôn gắn `client.on("error", …)` (xem `backend/src/lib/service-checks/redis.check.ts`).
- **Logic connection Redis ở `backend/src/lib/redis-options.ts`** (pure, có test). `queue.ts` import `config/env` và mở connection lúc load nên không import được từ script — dùng `redis-options.ts`, đừng nhân bản heuristic TLS.
- **Redis TLS:** `redis://` vs `rediss://` theo `REDIS_URL`, host `railway.internal`/`localhost`/`127.0.0.1`/`redis` → không TLS. TLS bật thì `rejectUnauthorized: false` — đừng mở rộng phạm vi này.
- **Mongoose defaults:** không truyền raw schema object `{ type: true, default: true }` lúc `create()` → `Cast to Boolean failed`. Gán giá trị thuần.
- **Pino "empty error object":** `logger.error({ error }, "msg")` in ra `{}`. Dùng `{ err: error }`.
- **CORS:** thêm custom header mới cho request (vd `x-idempotency-key`) thì phải thêm vào `allowedHeaders` ở `backend/src/config/cors.ts`, nếu không bị chặn ở preflight.
- **Script scratch không đặt trong `backend/src/`** — `src/**` vào thẳng typecheck/lint/build. Script one-off ở `backend/scripts/` (bị `tsconfig` exclude); logic cần giữ thì viết thành test.
- **`check:services` cố ý không import `config/env.ts`** — envalid fail-fast sẽ giết process, trong khi script phải _báo cáo_ thiếu key. Logic ở `backend/src/lib/service-checks/`.

## Gemini

- **Model pin cứng** ở `config/gemini-models.ts`: `GEMINI_MODEL` (sinh trip) và `GEMINI_INSIGHT_MODEL` (scrape RAG) cố ý khác nhau. Không dùng alias `-latest`: `intent-parser.service.ts`'s `extractJson()` là regex thô, Google đổi model sau alias có thể vỡ parsing âm thầm. Model bị deprecate trả 404 — khi đó mọi trip rơi về template fallback tĩnh mà job vẫn báo COMPLETED.
- Verify model còn sống bằng `generateContent` thật; `check:services` chỉ gọi endpoint `models`, không chứng minh model gọi được.
- **Free tier tính quota theo từng model:** `generateContent` ~20 request/ngày/model (`GenerateRequestsPerDayPerProjectPerModel-FreeTier`) — batch scrape có thể làm cạn quota sinh trip nếu dùng chung model. `embedContent` ~100 request/phút, retry mặc định của BullMQ tự vượt qua.

## CI và GitHub

- **Workflow chỉ nằm trên `develop` không chạy `schedule`/`workflow_dispatch`** — GitHub chỉ nhận 2 trigger này từ default branch (`main`). Không lỗi, không cảnh báo; `gh workflow run` trả 404. `pull_request` không bị ảnh hưởng.
- **CI từng "nói dối"** vì `lint`/`test` bọc `|| echo`. Thấy pattern đó xuất hiện lại là gate đang bị vô hiệu hoá.

## Môi trường dev local

- **Redis/Mongo Docker local (cổng 6379/27017) dùng chung giữa mọi worktree và phiên** — không có db-index cô lập (`REDIS_URL` db-index bị bỏ qua, xem `tech-debt.md`). Hệ quả: `test:integration` của phiên khác chạy `queue.obliterate()` reset job-id counter giữa chừng load-test (job biến mất khỏi `JobMetric`, lỗi `"Missing key for job <n>"`); một worker dev sống ở worktree khác giành job của test (`fallback-false-healthy.integration.test.ts` flake). Cần đo sạch thì chạy Redis riêng (`docker run` cổng khác). CI không bị (container riêng).
- **Máy sleep/hibernate làm Docker Desktop dừng container** (`Exited`) mà tiến trình Node vẫn chạy và fail `ECONNREFUSED` liên tục. Dữ liệu còn nguyên; `docker start` lại thủ công. `ScheduleWakeup` không đánh thức qua giấc sleep.
- **`TaskStop` trên `ts-node-dev --respawn`/`vite` không luôn giết hết cây tiến trình trên Windows** — tiến trình con mồ côi giữ cổng, server mới bind thất bại âm thầm. Kiểm `Get-NetTCPConnection -LocalPort <port> -State Listen`, `Stop-Process -Force` PID cũ.

## MCP

- **GitHub MCP OAuth:** GitHub không hỗ trợ Dynamic Client Registration (lỗi `does not support dynamic client registration`) — phải dùng OAuth App đăng ký sẵn: `client_id` `Ov23lijeoeW3qbp7cH35`, callback port `51004`, callback URL thật là `http://localhost:<port>/callback`. Vẫn cần `client_secret` dù có PKCE (xin chủ repo qua kênh an toàn):
  ```powershell
  $env:MCP_CLIENT_SECRET = "<secret>"
  claude mcp add --transport http --client-id Ov23lijeoeW3qbp7cH35 --client-secret --callback-port 51004 -s local github https://api.githubcopilot.com/mcp/
  ```
  Dùng biến môi trường thay vì paste vào prompt ẩn (PowerShell 5.1 có thể mất ký tự). `The socket connection was closed unexpectedly` thường chỉ cần thử lại `/mcp`.
- **`claude mcp` chạy từ shell khác → project-key khác:** Git Bash viết `d:/...`, PowerShell viết `D:\...`, bị coi là hai project. Quản lý MCP từ cùng shell chạy `claude` (ở repo này: PowerShell).
