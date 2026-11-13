# Deploy & operations

Railway (API + worker + Redis), Vercel (web), MongoDB Atlas. `develop` → staging, `main` → production. For anything that touches production or can cost money: see the authority and $0 rules in `CLAUDE.md`.

## Topology

|                  | Production               | Staging                                                                                                                                       |
| ---------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| API (Railway)    | `travelplan-api`         | `travelplan-api-staging` — domain is still `travelplan-web-staging-staging.up.railway.app` (renaming the service does not change the domain)  |
| Worker (Railway) | `travelplan-worker`      | `travelplan-worker-staging`                                                                                                                   |
| Redis            | Railway-hosted           | `Redis-hGhE` (Railway)                                                                                                                        |
| Mongo            | Atlas (`mongodb+srv://`) | Atlas database `travelplan_staging`, a dedicated user scoped `readWrite @ travelplan_staging`                                                 |
| Web              | Vercel Production        | Vercel Preview, `VITE_*` variables scoped to `git-branch=develop`                                                                             |
| Webhook          | Clerk/Stripe live        | Clerk (Svix `user.created`) + Stripe test-mode (`checkout.session.completed`, `customer.subscription.deleted`) pointing at the staging domain |

Staging deploys automatically on push to `develop`. `/health` = the process is alive, `/ready` = Mongo + Redis are connected — do not merge them.

**Entrypoint:** API = the Dockerfile `CMD` (`node backend/dist/backend/src/index.js`, because `backend/tsconfig.json` has `rootDir: ".."`); the worker must override the start command to `npm run start:worker --workspace=backend` on the dashboard (by default it runs the API's CMD).

**`railway.toml` has only `[build]`/`[deploy]`** and applies to every service + every environment. Each service's own start command/healthcheck is configured on the dashboard, not in this file. Only the root `vercel.json` is used by Vercel (root directory `.`, build `npx turbo run build --filter=@travelplan/web`, output `frontend/web/dist`).

BullBoard `/admin/queues` must have Basic Auth if enabled outside dev. The container must crash when a required env var is missing (envalid).

## Railway pitfalls

- **A new environment does not auto-create a `ServiceInstance`** for a GitHub-sourced service: `deploymentTriggerCreate`/`serviceInstanceDeploy`/`railway up` all fail (`ServiceInstance not found`, `404 UPLOAD_FAILED`). A trigger created with raw GraphQL does not receive pushes either. What works: dashboard → environment → **"+ New" → "GitHub Repo"** → Deploy (creates a new service named after the repo; the first build CRASHES because the variables are missing), then:
  1. Rename it with `serviceUpdate`.
  2. Worker: set `startCommand` with `serviceInstanceUpdate`.
  3. Copy the variables to the new service ID (`railway variable set … -s <serviceId>`).
  4. Redeploy with `serviceInstanceDeployV2(environmentId, serviceId)` — **`railway redeploy` reuses the old config snapshot** and does not read the current config.
- `railway environment new <name>` (without `--duplicate`) creates a truly empty environment; `--duplicate production` copies the production variables — override `MONGO_URI` before deploying.
- `deploymentTriggerCreate` defaults to `checkSuites: true`: `develop` has no workflow running on `push`, so the trigger waits forever. Set `checkSuites: false`.
- `railway up` without `-s <serviceId>` deploys to the most recently linked service (which may be a database). Always pass the service ID. If you slip: `deploymentCancel(id)` while it is still building.
- Domain: `railway domain -s <serviceId> -e <env> --port 3000 --json`, only after the instance exists.
- Do not provision Mongo on Railway for a secondary environment — production uses Atlas; check the real topology first (`railway variable list --service <api> --environment production --kv`). Atlas Network Access must allowlist `0.0.0.0/0` (Railway has no static IP).
- **`*.railway.internal` only resolves inside the Railway network** — a script run from an outside machine (including `railway run`) loops on `ENOTFOUND` forever. Recommended approach: `railway tcp-proxy create --port <port> --service <db> --environment <env> --json` (a new endpoint each time, 1 proxy per instance), splice the new host:port into the original `REDIS_URL` with a regex (do not type the password by hand), and `railway tcp-proxy delete <id> --yes` as soon as you are done. With `railway ssh` into the container, the production image has no `tsx`/devDependencies.

## Sentry

`backend/src/lib/sentry.ts`, `frontend/web/src/lib/sentry.ts`: `initSentry()` is a no-op when `SENTRY_DSN`/`VITE_SENTRY_DSN` is empty (a default of `""` is required, otherwise envalid kills the process). The tag `service: "api" | "worker" | "web"` matches Pino. Captured in the global error handler (`app.ts`), `worker.on("failed")`, `ErrorBoundary`. `tracesSampleRate: 0.1`, `sendDefaultPii: false`. The DSN is set on the 4 Railway services and on Vercel Production + Preview (applies to new deployments). Not yet verified with a real error.

## MongoDB backup

`backend/scripts/backup-mongo.sh` + `.github/workflows/backup-mongo.yml`: daily at 01:00 UTC, `mongodump --archive --gzip` → `aws s3 cp --endpoint-url` (Cloudflare R2), with a `BACKUP_MIN_SIZE_BYTES` guard (default 10 KiB). The 4 secrets `BACKUP_S3_ENDPOINT`/`BACKUP_S3_BUCKET`/`BACKUP_AWS_ACCESS_KEY_ID`/`BACKUP_AWS_SECRET_ACCESS_KEY` are set. The cron only runs when the workflow exists on `main` (see `pitfalls.md`). Restore runbook: `backend/scripts/BACKUP.md` (deliberately in git, not in `docs/`).

## Google Cloud billing

- `GOOGLE_PLACES_API_KEY`: project `travelplan-486522`, its own billing account `01C84D-A6B93B-F517F1`, a $5 budget with a killswitch.
- `GEMINI_API_KEY`: project `gen-lang-client-0544187342`, **no billing attached** — exceeding the quota returns 429 and never charges money.
- Never share a billing account across multiple apps: in April 2026 another project on the same account had its key leaked, and the emergency closure of the account killed Places too.
- Check: `gcloud billing projects describe <PROJECT_ID>` (`billingEnabled`), `gcloud billing accounts describe <ACCOUNT_ID>`, `gcloud billing accounts get-iam-policy <ACCOUNT_ID>`.
- **Killswitch:** Budget → Pub/Sub → Cloud Function `stop_billing` calls `update_project_billing_info(billing_account_name="")`, threshold 85% (Pub/Sub lags ~20 minutes). The function needs `roles/billing.admin` on the billing account. Always deploy with `SIMULATE_DEACTIVATION = True` first, test with `gcloud pubsub topics publish <topic> --message='{"costAmount": X, "budgetAmount": Y}'`, see the log `"Billing disabled. (Simulated)"`, and only then switch to `False`.
- Places: the field mask `rating`/`userRatingCount` pushes the SKU up to the Pro tier (5,000 free/month). Lowering a quota by > 10% with `gcloud alpha services quota update` needs `--force` (e.g. `GetPhotoMediaRequest` defaults to 175,000/day).

## Frontend environment variables

`frontend/web/src/config/env.ts` reads `VITE_MAPBOX_ACCESS_TOKEN` (preferred) or `VITE_MAPBOX_TOKEN`. `VITE_*` has no machine-readable schema like envalid — check by hand when adding a variable.

## Releasing abkit to PyPI

`.github/workflows/release-abkit.yml` runs on a push of the tag `abkit-v<version>` (must match `version` in `analytics/abkit/pyproject.toml` and `__version__`). The PyPI package is `abkit-experiments` (the name `abkit` on PyPI belongs to someone else; the import is still `abkit`). Published with Trusted Publishing, no token: the `publish` job runs in the GitHub environment `pypi` and is the only job with `id-token: write`. The repo owner's one-time job: add a pending trusted publisher on PyPI (project `abkit-experiments`, repo `tlamDson/TravelPlan`, workflow `release-abkit.yml`, environment `pypi`) and create the `pypi` environment. The results tables in the README and `analytics/abkit/docs/results.md` are generated from `runs.csv`: `python -m abkit.readme_results --write`.
