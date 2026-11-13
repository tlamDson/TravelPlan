---
name: travelplan-devops
description: Use when changing a Dockerfile, docker-compose.yml, .github/workflows/**, railway.toml, vercel.json, environment variables, or anything related to TravelPlan's deploy/CI.
---

# DevOps — TravelPlan

## Principles

- **Multi-stage Docker builds are mandatory** — keep the image small and separate the build stage from the runtime stage.
- **Split secrets by least privilege**: web only needs `VITE_MAPBOX_ACCESS_TOKEN`/`VITE_CLERK_PUBLISHABLE_KEY`/`VITE_API_URL`; the api needs `MONGO_URI`+`CLERK_SECRET_KEY`+…; the worker needs the AI key + DB, not the web's secrets.
- **The container must crash when a required env var is missing** — already done through `envalid` in `backend/src/config/env.ts`; keep this pattern when adding new variables.
- **IaC only** — do not change configuration through the Railway/Vercel UI without reflecting it back in the repo (`railway.toml`, `vercel.json`). Note: Railway only reads `[build]`/`[deploy]` from `railway.toml` — there is no `[[services]]`; the start command/healthcheck of each service is dashboard configuration (per service, per environment).
- **BullBoard `/admin/queues` must have Basic Auth** if enabled in production/staging — never leave it publicly open.

## The repo's real CI (differs from the old docs)

`.github/workflows/ci-pr.yml` — runs on `pull_request` into `develop`/`main`. **The job names are the required status checks on GitHub** — do not rename them, do not add `paths:` to `on: pull_request`, and do not put a job-level `if:` on the 3 required jobs (gate at the step level with an env variable such as `SHOULD_BUILD`). Full detail in `.claude/rules/git-pr.md`.

| Job       | Name (= required check)                                                                         |
| --------- | ----------------------------------------------------------------------------------------------- |
| `changes` | Detect changed paths (not required, only produces the dorny/paths-filter output for other jobs) |
| `ci`      | Lint + Unit Tests                                                                               |
| `quality` | Typecheck + Build                                                                               |
| `docker`  | Backend Docker Build                                                                            |

`.github/workflows/ci-main.yml` — runs on `push` to `main`, a single job `Full CI + Unit Tests` that runs lint → typecheck → build → test in sequence.

`.github/workflows/data-pipeline.yml` — a monthly ETL cron (city cost scraper), not a PR check; do not touch it unless explicitly assigned.

## Environments

`develop` → staging, `main` → production. **Staging is already set up**: the Railway environment `staging` has `travelplan-api-staging` (the API, whose domain keeps the historical name `travelplan-web-staging-staging.up.railway.app` — renaming the service does not change the auto-generated domain), `travelplan-worker-staging`, `Redis-hGhE`; MongoDB is a separate Atlas database `travelplan_staging` (not Railway-hosted); Vercel scopes `VITE_*` to `Preview` + `git-branch=develop`. Full detail plus all the infrastructure-setup pitfalls (a Railway `ServiceInstance` is not auto-created, `checkSuites` hanging forever, `redeploy` using an old snapshot...) are in `.claude/reference/deploy-ops.md`. Bootstrapping a new service in a new environment (if one is needed) **has no pure API/CLI path** — it must go through the dashboard "+ New" → "GitHub Repo"; see the full recipe there before guessing.

## Health check

`GET /health` — checks that the process is alive. `GET /ready` — checks that Mongo + Redis are connected. Used for the Railway/Docker readiness probe; do not merge these two endpoints into one.

## Redis TLS

`backend/src/lib/queue.ts` detects `redis://` vs `rediss://` from `REDIS_URL`, plus a host heuristic (`railway.internal`/`localhost`/`127.0.0.1`/`redis` → no TLS). When adding a new managed Redis provider, recheck this logic instead of hardcoding another special case.
