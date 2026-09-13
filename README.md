# TravelPlan

Agentic travel planner monorepo: React web app, Express API, BullMQ workers, shared Zod contracts, MongoDB.

## Contents

- [Overview](#overview)
- [Tech stack](#tech-stack)
- [Repository layout](#repository-layout)
- [Prerequisites](#prerequisites)
- [Environment variables](#environment-variables)
- [Redis, TLS & BullMQ](#redis-tls--bullmq)
- [Local development](#local-development)
- [Deployment (Railway)](#deployment-railway)
- [Scripts](#scripts)
- [Documentation](#documentation)
- [Troubleshooting](#troubleshooting)

---

## Overview

- **Planner:** Trip generation via Gemini, validation with Mapbox + Google Places (field-masked requests), Mongo `PlaceCache` for repeat queries.
- **Queue:** BullMQ on Redis for trip generation, calendar sync, and destination insight jobs.
- **Auth:** Clerk. **Maps:** Mapbox GL. **Contracts:** `packages/shared` (Zod).

Trip lifecycle (simplified): `DRAFT → QUEUED → PROCESSING → COMPLETED` (or `FAILED`).

---

## Tech stack

| Area     | Stack                                                                   |
| -------- | ----------------------------------------------------------------------- |
| Monorepo | npm workspaces (`packageManager: npm@10.9.3`)                           |
| Web      | React (Vite), Tailwind, shadcn/ui, TanStack Query, Zustand              |
| API      | Node 20+, Express, Mongoose, Zod, Envalid, Pino                         |
| Queue    | BullMQ + **ioredis**                                                    |
| Data     | MongoDB Atlas or local / Docker                                         |
| Deploy   | Frontend often Vercel; API + worker + Redis described in `railway.toml` |

---

## Repository layout

```
TravelPlan/
├── backend/                 # Express API + worker entrypoints
├── frontend/web/            # Vite SPA
├── packages/shared/         # Zod schemas & shared types
├── docker-compose.yml       # Local Mongo/Redis (if used)
├── railway.toml             # Railway: API, worker, Redis service
├── env.docker.example       # Template for Docker `.env.docker`
└── README.md
```

---

## Prerequisites

- Node.js **20+**
- **npm** 10+
- **Docker** (optional, for local MongoDB/Redis or compose stack)
- Accounts as needed: Clerk, MongoDB, Mapbox, Google Places, Gemini, etc.

---

## Environment variables

Validated in `backend/src/config/env.ts`. Common variables:

| Variable                                 | Purpose                                                                                                                                                          |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MONGO_URI`                              | MongoDB connection string                                                                                                                                        |
| `REDIS_HOST`                             | Redis hostname (e.g. `localhost`, `redis`, or `*.railway.internal`)                                                                                              |
| `REDIS_PORT`                             | Default `6379`                                                                                                                                                   |
| `REDIS_PASSWORD`                         | Optional locally; set in Docker/prod when Redis requires auth                                                                                                    |
| `REDIS_URL`                              | Optional. If set, overrides host/port/password (e.g. Railway `redis://default:...@...railway.internal:6379`). Use `redis://` for plain TCP, `rediss://` for TLS. |
| `REDIS_TLS`                              | Optional override: `true` / `false` / `1` / `0`                                                                                                                  |
| `CLERK_SECRET_KEY` / web publishable key | Auth                                                                                                                                                             |
| `GEMINI_API_KEY`                         | Worker / AI pipeline                                                                                                                                             |
| `MAPBOX_ACCESS_TOKEN`                    | Geocoding / maps                                                                                                                                                 |
| `GOOGLE_PLACES_API_KEY`                  | Places Text Search, Nearby, photo media                                                                                                                          |
| `OPENWEATHER_API_KEY`                    | Weather proxy (optional)                                                                                                                                         |
| `SERPER_API_KEY`                         | Insight scraping (optional)                                                                                                                                      |

**Frontend (`frontend/web`):** `VITE_*` for API base URL, Clerk, Mapbox, feature flags (see existing sections in repo for Calendar/VIP).

Create `backend/.env` (or `.env.local`) from your team’s template. For **Docker Compose** API/worker, use **`.env.docker`** at repo root (see `env.docker.example`).

---

## Redis, TLS & BullMQ

Connection logic lives in **`backend/src/lib/queue.ts`**.

- **Local / Docker Redis** (`localhost`, `127.0.0.1`): **no TLS**.
- **Railway private Redis** (hostname contains `railway.internal`): **no TLS** — plain TCP on port 6379.
- **Managed TLS Redis** (e.g. Upstash, `*.upstash.io`): **TLS** enabled (`rejectUnauthorized: false` for compatibility with some providers).

**Retry:** ioredis `retryStrategy` backoff is configured for transient disconnects.

**Workers** (`backend/src/worker.ts`, insight worker): use BullMQ's own defaults for `stalledInterval`/`lockDuration` — no custom override. A prior tune (`stalledInterval: 30s`, `lockDuration: 60s`, justified as "fewer stalled checks → fewer Redis commands; lock covers long AI/IO jobs") was measured and reverted: 30s was already BullMQ's default (a no-op), and lock renewal is a JS timer that fires every `lockDuration/2` regardless of job duration as long as the event loop stays free — a longer lock buys nothing for `await`-based jobs (proven with a real BullMQ Worker in `worker-lock-duration.integration.test.ts`), it only slows recovery after a genuinely crashed worker. See `npm run measure:pipeline --workspace=backend -- --report` for real throughput/latency/stall numbers from production. On shutdown, trip, calendar, and insight workers are closed cleanly.

**Billing note:** Serverless Redis products often charge **per command**. BullMQ workers generate steady traffic (EVALSHA, ZRANGE, etc.). For a single small deployment, **one Redis instance on the same host as the app** (e.g. Railway Redis service) avoids per-command surprise bills from a separate vendor.

---

## Local development

```bash
git clone <your-repo-url>
cd TravelPlan
npm install
```

1. Start MongoDB and Redis (Docker Compose or local installs).
2. Configure `backend/.env` with `MONGO_URI`, `REDIS_*`, Clerk, `GEMINI_API_KEY`, etc.
3. From repo root:

```bash
npm run dev:api      # API — http://localhost:3000
npm run dev:web      # Web — http://localhost:5173
npm run dev:worker   # Optional — processes BullMQ jobs
```

4. Production build (all workspaces): `npm run build`

**Health:** `GET /health` / `GET /ready` (readiness may check Mongo + Redis).

**Docker:** See `env.docker.example` and project notes for `VITE_API_URL` pointing at the exposed API port.

---

## Deployment (Railway)

`railway.toml` supplies only the **build** config — Dockerfile builder + path + watch patterns — shared by every service in every Railway environment. Railway’s config file has no `[[services]]` array; verified against real deployment metadata that only `build.builder`/`build.dockerfilePath` are ever read from it. Per-service start command and healthcheck are dashboard settings, because this one file is shared by both services:

- **travelplan-api** (the API) — start command is the Dockerfile `CMD`, `node backend/dist/backend/src/index.js` (note `backend/tsconfig.json`’s `rootDir: ".."` reproduces the folder tree under `dist/`). Healthcheck `/health`, port 3000.
- **travelplan-worker** — start command `npm run start:worker --workspace=backend` → `node backend/dist/backend/src/worker.js`. No HTTP listener, so it has no healthcheck path configured.

Set **`REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD`** from Railway’s Redis service (private host often includes `railway.internal`). Do **not** force TLS for that internal host — the code skips TLS automatically.

Scale workers conservatively if you care about Redis command volume (e.g. one replica unless you need more throughput).

### Staging environment (`develop` → staging, `main` → production)

The repo’s Git Flow (see `.claude/rules/workflow.md`) assumes two deploy targets, set up through each provider’s dashboard (not something `railway.toml`/`vercel.json` alone can express, since environment membership and which secrets belong to which environment are dashboard/CLI concepts, not repo config). Full copy-pasteable variable list: `.env.staging.example`.

**Railway**

1. In the Railway project, create a second Environment named `staging` — **`railway environment new staging`** (no `--duplicate`) creates it genuinely blank (verified: zero services, zero vars). Only the dashboard's "Duplicate Environment" option or `--duplicate production` copies production's variables; if you ever do use that path, override `MONGO_URI` (and every other var below) _before_ anything deploys, or staging will write straight into the production database.
2. Deployment triggers (branch tracking) are per-service, per-environment rows — not a single project-wide setting. For each of `travelplan-api`/`travelplan-worker`, add a trigger with `branch: develop` pointed at the new `staging` environment (Settings → each service → Triggers in the dashboard; via API it's the `deploymentTriggerCreate` GraphQL mutation with the existing production trigger's `repository`/`provider` copied over). This mirrors production's `main` trigger without touching it. **Set `checkSuites: false` on these two new triggers** — production's triggers have it `true`, which is fine there because `ci-main.yml` runs on every push to `main` and produces a GitHub check suite for Railway to wait for, but **no workflow in this repo runs on `push` to `develop`** (`ci-pr.yml` only fires on `pull_request`) — a trigger left at the copied `checkSuites: true` default waits forever for a check suite that will never exist, and the environment silently never deploys with no error surfaced anywhere.
3. Provision a separate MongoDB and Redis for staging — do not point staging at the production database, and do not reuse the E2E database (`travelplan_e2e`, which gets dropped on every E2E run). **Match production's actual topology, not the cheapest Railway default**: production's `MONGO_URI` is an Atlas `mongodb+srv://` connection string, not a Railway-hosted Mongo plugin (verify with `railway variable list --service travelplan-api --environment production --kv | grep MONGO_URI` before assuming otherwise) — so staging's Mongo should be a new database (`travelplan_staging`) in the same Atlas project, with its own dedicated database user scoped via **Specific Privileges** (`readWrite` on `travelplan_staging` only, not "any database") rather than reusing the local-dev or production user. Atlas's Network Access list must allow Railway's egress (Railway has no static IP by default, so this typically means `0.0.0.0/0` — Allow Access from Anywhere — unless you've paid for Railway's static IP add-on). Redis has no such constraint: `railway add --database redis` while linked to the `staging` environment provisions a project-scoped instance, referenced from the app services with Railway's `${{ServiceName.VAR}}` syntax (e.g. `REDIS_URL=${{Redis-hGhE.REDIS_URL}}`) rather than copy-pasting raw values.
4. Set every var in `.env.staging.example` Section A on **both** `travelplan-api` and `travelplan-worker` — the worker imports the same `config/env.ts` and crashes at boot on any missing required var, identically to the API. Use **test-mode** keys where the provider supports them (Clerk test instance — reuse the one already used by E2E, Stripe test keys) so staging never touches real user data or charges real cards. Remove any stray `VITE_*` vars from these services; they're backend services and don't consume them.
5. `FRONTEND_URL` on the staging API = the Vercel branch alias for `develop` (see below).
6. **A service's `ServiceInstance` for the new environment does not exist yet at this point** — creating the Environment and the DeploymentTrigger only wires the _configuration_; Railway doesn't materialize a running instance for a GitHub-sourced service just from that (`serviceInstanceDeploy`/`V2`, `environmentTriggersDeploy` all fail with `ServiceInstance not found` until an instance exists). The working recipe: on the dashboard, in the empty environment, **"+ New" → "GitHub Repo"** → pick the repo → **Deploy** — this always creates a **brand-new service** auto-named after the repo (no rename option at creation, no way to "attach" an existing service from another environment). Its first build will crash (no env vars yet); from there:
   1. Rename it via the `serviceUpdate` mutation (`input: { name }`) to match production's naming.
   2. If it's the worker, override its start command via `serviceInstanceUpdate` (`input: { startCommand }`) — it defaults to the Dockerfile `CMD` (correct for the API, wrong for the worker).
   3. Copy every env var from `.env.staging.example` Section A/B onto this service's real ID (vars set earlier under the placeholder service name live on a different, never-deployed service).
   4. ⚠️ **`railway redeploy` reuses the original deployment's snapshot config, not current instance settings** — setting `startCommand` and then calling `redeploy` silently keeps running the old command (caught this: worker logs showed the API's `"Server is running... port=3000"` instead of worker boot logs). Use `serviceInstanceDeployV2(environmentId, serviceId)` instead for a genuinely fresh deploy that reads current config — it only fails `ServiceInstance not found` before the instance exists at all; once there's been at least one deploy (even a crashed one) it works normally.
   5. `railway domain -s <serviceId> -e staging --port 3000 --json` generates the public domain — only callable once the instance exists (after step 1 of "+ New" above).

**Vercel** — by default every branch push gets an automatic preview deployment, and the `develop` branch already has a **stable branch alias** URL (`<project>-git-develop-<scope>.vercel.app`) — no custom domain is required. The actual work is untangling Preview from Production:

1. Today, every `VITE_*` var is set with the **same value** across Production, Preview, and Development targets — meaning the `develop` preview currently calls the **production** API and **production** Clerk. Remove the Preview target from each existing (Production-value) var, then add a new **Preview-only** entry with the staging value — see `.env.staging.example` Section C.
2. `VITE_API_URL` **must include the `/api` suffix** (`lib/axios.ts` uses it as `baseURL`, callers pass paths without `/api`) — verify the Production value already does before copying the pattern.
3. Vercel builds every deployment, including `develop`, via the root `vercel.json` → `vite build` in **production mode**. `frontend/web/.env.staging` and `npm run build:staging` are **local-only** — Vercel never runs them, keeping them "in sync" is not meaningful.
4. Add `VITE_ENV=staging` to the Preview target — nothing sets it today, and it’s what lets the frontend distinguish a staging build from a real production one.
5. Redeploy `develop` after saving env vars — Vite bakes them in at build time.

Once both are wired, `develop` becomes a real staging deploy target and PRs merged there are verifiable before they ever reach `main`. Confirm with `curl https://<staging-api>/health` → `{"status":"ok","env":"staging"}`.

---

## Scripts

| Command              | Description                          |
| -------------------- | ------------------------------------ |
| `npm run dev:api`    | Backend dev server                   |
| `npm run dev:web`    | Frontend dev server                  |
| `npm run dev:worker` | BullMQ worker                        |
| `npm run build`      | Build all workspaces                 |
| `npm run test`       | Tests (where configured per package) |
| `npm run typecheck`  | TypeScript checks                    |

---

## Documentation

| Path               | Topic                                                              |
| ------------------ | ------------------------------------------------------------------ |
| `docs/agents/*.md` | Role-specific standards (architect, backend, frontend, devops, qa) |
| `docs/`            | Roadmap, progress, roles                                           |

---

## Troubleshooting

**Redis connection errors after moving cloud providers**

- Confirm `REDIS_HOST` matches the provider (internal Railway hostname vs public Upstash hostname).
- Wrong TLS mode: internal Railway Redis should **not** use TLS; Upstash **must** use TLS.

**MongoDB connection refused**

- Ensure `MONGO_URI` is correct and the DB is reachable from the API (network / Atlas IP allowlist).

**Worker idle but jobs stuck**

- Ensure `npm run dev:worker` (or Railway worker service) is running and using the **same** Redis as the API.

**Build failures**

- Run `npm run build` from the repo root; fix TypeScript and lint errors before merging.

---

## License

MIT — see `LICENSE` if present.

---

**Last updated:** 2026-04-01
