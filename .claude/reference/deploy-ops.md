# Deploy & vận hành

Railway (API + worker + Redis), Vercel (web), MongoDB Atlas. `develop` → staging, `main` → production. Mọi việc chạm production hoặc có thể tốn tiền: xem luật quyền và $0 trong `CLAUDE.md`.

## Topology

|                  | Production               | Staging                                                                                                                           |
| ---------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| API (Railway)    | `travelplan-api`         | `travelplan-api-staging` — domain vẫn `travelplan-web-staging-staging.up.railway.app` (rename service không đổi domain)           |
| Worker (Railway) | `travelplan-worker`      | `travelplan-worker-staging`                                                                                                       |
| Redis            | Railway-hosted           | `Redis-hGhE` (Railway)                                                                                                            |
| Mongo            | Atlas (`mongodb+srv://`) | Atlas database `travelplan_staging`, user riêng scope `readWrite @ travelplan_staging`                                            |
| Web              | Vercel Production        | Vercel Preview, biến `VITE_*` scope `git-branch=develop`                                                                          |
| Webhook          | Clerk/Stripe live        | Clerk (Svix `user.created`) + Stripe test-mode (`checkout.session.completed`, `customer.subscription.deleted`) trỏ domain staging |

Deploy staging tự động khi push vào `develop`. `/health` = process sống, `/ready` = Mongo + Redis đã connect — đừng gộp.

**Entrypoint:** API = Dockerfile `CMD` (`node backend/dist/backend/src/index.js`, do `backend/tsconfig.json` có `rootDir: ".."`); worker phải override start command thành `npm run start:worker --workspace=backend` trên dashboard (mặc định chạy CMD của API).

**`railway.toml` chỉ có `[build]`/`[deploy]`** và áp cho mọi service + mọi environment. Start command/healthcheck riêng từng service cấu hình trên dashboard, không đặt ở file này. Chỉ root `vercel.json` được Vercel dùng (root directory `.`, build `npx turbo run build --filter=@travelplan/web`, output `frontend/web/dist`).

BullBoard `/admin/queues` phải có Basic Auth nếu bật ngoài dev. Container phải crash khi thiếu env bắt buộc (envalid).

## Cạm bẫy Railway

- **Environment mới không tự sinh `ServiceInstance`** cho service nguồn GitHub: `deploymentTriggerCreate`/`serviceInstanceDeploy`/`railway up` đều fail (`ServiceInstance not found`, `404 UPLOAD_FAILED`). Trigger tạo bằng GraphQL thô cũng không nhận push. Cách chạy được: dashboard → environment → **"+ New" → "GitHub Repo"** → Deploy (tạo service mới tên theo repo, build đầu CRASHED vì chưa có biến), rồi:
  1. Đổi tên bằng `serviceUpdate`.
  2. Worker: set `startCommand` bằng `serviceInstanceUpdate`.
  3. Copy biến sang service ID mới (`railway variable set … -s <serviceId>`).
  4. Deploy lại bằng `serviceInstanceDeployV2(environmentId, serviceId)` — **`railway redeploy` dùng lại snapshot config cũ**, không đọc config hiện tại.
- `railway environment new <name>` (không `--duplicate`) tạo environment rỗng thật; `--duplicate production` copy biến production — override `MONGO_URI` trước khi deploy.
- `deploymentTriggerCreate` mặc định `checkSuites: true`: `develop` không có workflow chạy trên `push` nên trigger chờ vĩnh viễn. Set `checkSuites: false`.
- `railway up` không có `-s <serviceId>` deploy vào service đang link gần nhất (có thể là database). Luôn truyền service ID. Lỡ tay: `deploymentCancel(id)` khi còn building.
- Domain: `railway domain -s <serviceId> -e <env> --port 3000 --json`, chỉ sau khi instance tồn tại.
- Không provision Mongo trên Railway cho environment phụ — production dùng Atlas; kiểm topology thật trước (`railway variable list --service <api> --environment production --kv`). Atlas Network Access phải allowlist `0.0.0.0/0` (Railway không có IP tĩnh).
- **`*.railway.internal` chỉ resolve trong network Railway** — script chạy từ máy ngoài (kể cả `railway run`) lặp `ENOTFOUND` vô hạn. Cách khuyên dùng: `railway tcp-proxy create --port <port> --service <db> --environment <env> --json` (endpoint mới mỗi lần, 1 proxy/instance), ghép host:port mới vào `REDIS_URL` gốc bằng regex (không gõ tay password), `railway tcp-proxy delete <id> --yes` ngay khi xong. `railway ssh` vào container thì image production không có `tsx`/devDependencies.

## Sentry

`backend/src/lib/sentry.ts`, `frontend/web/src/lib/sentry.ts`: `initSentry()` no-op khi `SENTRY_DSN`/`VITE_SENTRY_DSN` rỗng (default `""` bắt buộc, nếu không envalid giết process). Tag `service: "api" | "worker" | "web"` khớp Pino. Capture ở global error handler (`app.ts`), `worker.on("failed")`, `ErrorBoundary`. `tracesSampleRate: 0.1`, `sendDefaultPii: false`. DSN đã set trên 4 service Railway và Vercel Production + Preview (áp cho deployment mới). Chưa verify bằng lỗi thật.

## Backup MongoDB

`backend/scripts/backup-mongo.sh` + `.github/workflows/backup-mongo.yml`: hằng ngày 01:00 UTC, `mongodump --archive --gzip` → `aws s3 cp --endpoint-url` (Cloudflare R2), guard `BACKUP_MIN_SIZE_BYTES` (mặc định 10 KiB). 4 secret `BACKUP_S3_ENDPOINT`/`BACKUP_S3_BUCKET`/`BACKUP_AWS_ACCESS_KEY_ID`/`BACKUP_AWS_SECRET_ACCESS_KEY` đã set. Cron chỉ chạy khi workflow có trên `main` (xem `pitfalls.md`). Runbook restore: `backend/scripts/BACKUP.md` (cố ý trong git, không ở `docs/`).

## Google Cloud billing

- `GOOGLE_PLACES_API_KEY`: project `travelplan-486522`, billing account riêng `01C84D-A6B93B-F517F1`, budget $5 có killswitch.
- `GEMINI_API_KEY`: project `gen-lang-client-0544187342`, **không gắn billing** — vượt quota ra 429, không bao giờ tính tiền.
- Không bao giờ dùng chung billing account cho nhiều app: tháng 4/2026 một project khác cùng account bị lộ key, đóng account khẩn cấp làm Places chết theo.
- Kiểm: `gcloud billing projects describe <PROJECT_ID>` (`billingEnabled`), `gcloud billing accounts describe <ACCOUNT_ID>`, `gcloud billing accounts get-iam-policy <ACCOUNT_ID>`.
- **Killswitch:** Budget → Pub/Sub → Cloud Function `stop_billing` gọi `update_project_billing_info(billing_account_name="")`, threshold 85% (Pub/Sub trễ ~20 phút). Function cần `roles/billing.admin` trên billing account. Luôn deploy `SIMULATE_DEACTIVATION = True` trước, test bằng `gcloud pubsub topics publish <topic> --message='{"costAmount": X, "budgetAmount": Y}'`, thấy log `"Billing disabled. (Simulated)"` rồi mới chuyển `False`.
- Places: field mask `rating`/`userRatingCount` đẩy SKU lên tier Pro (5.000 free/tháng). Giảm quota > 10% bằng `gcloud alpha services quota update` cần `--force` (vd `GetPhotoMediaRequest` mặc định 175.000/ngày).

## Biến môi trường frontend

`frontend/web/src/config/env.ts` đọc `VITE_MAPBOX_ACCESS_TOKEN` (ưu tiên) hoặc `VITE_MAPBOX_TOKEN`. `VITE_*` không có schema máy đọc được như envalid — kiểm thủ công khi thêm biến.
