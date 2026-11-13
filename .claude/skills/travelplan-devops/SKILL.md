---
name: travelplan-devops
description: Dùng khi sửa Dockerfile, docker-compose.yml, .github/workflows/**, railway.toml, vercel.json, biến môi trường, hoặc bất kỳ thứ gì liên quan tới deploy/CI của TravelPlan.
---

# DevOps — TravelPlan

## Nguyên tắc

- **Multi-stage Docker build bắt buộc** — giữ image nhỏ, tách build stage khỏi runtime stage.
- **Tách secret theo least-privilege**: web chỉ cần `VITE_MAPBOX_ACCESS_TOKEN`/`VITE_CLERK_PUBLISHABLE_KEY`/`VITE_API_URL`; api cần `MONGO_URI`+`CLERK_SECRET_KEY`+…; worker cần AI key + DB, không cần secret của web.
- **Container phải crash khi thiếu env bắt buộc** — đã làm qua `envalid` ở `backend/src/config/env.ts`, giữ nguyên pattern này khi thêm biến mới.
- **IaC only** — không chỉnh cấu hình qua UI của Railway/Vercel mà không phản ánh lại trong repo (`railway.toml`, `vercel.json`). Lưu ý: Railway chỉ đọc `[build]`/`[deploy]` từ `railway.toml` — không có `[[services]]`; start command/healthcheck riêng từng service là cấu hình dashboard (mỗi service, mỗi environment).
- **BullBoard `/admin/queues` phải có Basic Auth** nếu bật ở production/staging — không bao giờ để mở public.

## CI thật của repo (khác tài liệu cũ)

`.github/workflows/ci-pr.yml` — chạy trên `pull_request` vào `develop`/`main`. **Tên job chính là required status check trên GitHub** — không được đổi tên, không được thêm `paths:` vào `on: pull_request`, không được đặt `if:` ở cấp job cho 3 job required (gate ở cấp step bằng biến env như `SHOULD_BUILD`). Chi tiết đầy đủ ở `.claude/rules/git-pr.md`.

| Job       | Tên (= required check)                                                               |
| --------- | ------------------------------------------------------------------------------------ |
| `changes` | Detect changed paths (không required, chỉ để dorny/paths-filter output cho job khác) |
| `ci`      | Lint + Unit Tests                                                                    |
| `quality` | Typecheck + Build                                                                    |
| `docker`  | Backend Docker Build                                                                 |

`.github/workflows/ci-main.yml` — chạy trên `push` vào `main`, một job `Full CI + Unit Tests` chạy tuần tự lint → typecheck → build → test.

`.github/workflows/data-pipeline.yml` — cron ETL hàng tháng (city cost scraper), không phải PR check, không đụng vào trừ khi được giao rõ ràng.

## Môi trường

`develop` → staging, `main` → production. **Staging đã dựng xong**: Railway environment `staging` có `travelplan-api-staging` (API, domain vẫn giữ tên lịch sử `travelplan-web-staging-staging.up.railway.app` — rename service không đổi domain tự sinh), `travelplan-worker-staging`, `Redis-hGhE`; MongoDB là Atlas database `travelplan_staging` riêng (không phải Railway-hosted); Vercel scope `VITE_*` theo `Preview` + `git-branch=develop`. Chi tiết đầy đủ + toàn bộ cạm bẫy dựng hạ tầng (Railway `ServiceInstance` không tự sinh, `checkSuites` treo vĩnh viễn, `redeploy` dùng snapshot cũ...) ở `.claude/reference/deploy-ops.md`. Bootstrap 1 service mới trong environment mới (nếu cần thêm) **không có đường API/CLI thuần** — phải qua dashboard "+ New" → "GitHub Repo", xem công thức đầy đủ ở đó trước khi tự đoán.

## Health check

`GET /health` — kiểm tra process còn sống. `GET /ready` — kiểm tra Mongo + Redis đã connect. Dùng cho readiness probe của Railway/Docker, đừng gộp hai endpoint này làm một.

## Redis TLS

`backend/src/lib/queue.ts` tự nhận diện `redis://` vs `rediss://` từ `REDIS_URL`, cộng heuristic theo host (`railway.internal`/`localhost`/`127.0.0.1`/`redis` → không TLS). Khi thêm managed Redis provider mới, kiểm lại logic này thay vì hardcode thêm case riêng.
