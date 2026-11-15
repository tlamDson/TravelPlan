# Pitfalls we paid for

Read when you touch the matching area. Railway/Vercel/GCP pitfalls are in `deploy-ops.md`; test/E2E ones in `test-infra.md`.

## Backend, BullMQ, Redis

- **The "IDLE" bug:** with a priority queue, a job enters the BullMQ state `"prioritized"`, not `"waiting"`. `JOB_STATE_TO_STATUS` must map `prioritized → "QUEUED"`, otherwise the UI reports 0% IDLE even though the job is running.
- **BullMQ `removeOnComplete` makes successful jobs disappear:** `getJobCounts()` does not distinguish a finished job from one that never ran. To know what finished, look up the **result** (the document that was written), not the queue. Re-adding the same `jobId` as a `failed` job does not retry on its own — `job.remove()` first, then `queue.add()`.
- **BullMQ lock:** lock renewal is a timer that runs every `lockDuration/2`, so a job with a long `await` never stalls; only synchronous code blocking the event loop longer than the lock stalls. A longer lock only slows recovery when a worker crashes. The worker uses the BullMQ defaults (the `lockDuration: 60s` was removed).
- **ioredis swallows the cause:** `connect()` rejects with `"Connection is closed."`, and the real error (`ECONNREFUSED`, `ENOTFOUND`, `NOAUTH`) only surfaces through the `"error"` event. Always attach `client.on("error", …)` (see `backend/src/lib/service-checks/redis.check.ts`).
- **Redis connection logic is in `backend/src/lib/redis-options.ts`** (pure, tested). `queue.ts` imports `config/env` and opens a connection on load, so it cannot be imported from a script — use `redis-options.ts` and do not duplicate the TLS heuristic.
- **Redis TLS:** `redis://` vs `rediss://` per `REDIS_URL`, host `railway.internal`/`localhost`/`127.0.0.1`/`redis` → no TLS. When TLS is on, `rejectUnauthorized: false` — do not widen this scope.
- **Mongoose defaults:** do not pass a raw schema object `{ type: true, default: true }` to `create()` → `Cast to Boolean failed`. Assign plain values.
- **Pino "empty error object":** `logger.error({ error }, "msg")` prints `{}`. Use `{ err: error }`.
- **CORS:** when adding a new custom request header (e.g. `x-idempotency-key`) you must add it to `allowedHeaders` in `backend/src/config/cors.ts`, otherwise it is blocked at preflight.
- **Do not put scratch scripts in `backend/src/`** — `src/**` goes straight into typecheck/lint/build. One-off scripts go in `backend/scripts/` (excluded by `tsconfig`); logic worth keeping should be written as a test.
- **`check:services` deliberately does not import `config/env.ts`** — envalid's fail-fast would kill the process, while the script has to _report_ the missing keys. The logic is in `backend/src/lib/service-checks/`.

## Gemini

- **Model pinned hard** in `config/gemini-models.ts`: `GEMINI_MODEL` (trip generation) and `GEMINI_INSIGHT_MODEL` (RAG scrape) intentionally differ. Do not use the `-latest` alias: `extractJson()` in `intent-parser.service.ts` is a crude regex, and Google changing the model behind an alias could silently break parsing. A deprecated model returns 404 — then every trip falls back to the static template while the job still reports COMPLETED.
- Verify a model is alive with a real `generateContent`; `check:services` only calls the `models` endpoint, which does not prove the model can be called.
- **The free tier counts quota per model:** `generateContent` ~20 requests/day/model (`GenerateRequestsPerDayPerProjectPerModel-FreeTier`) — a batch scrape can exhaust the trip-generation quota if they share a model. `embedContent` ~100 requests/minute, and BullMQ's default retry gets past it on its own.

## CI and GitHub

- **A workflow that exists only on `develop` does not run `schedule`/`workflow_dispatch`** — GitHub only accepts these 2 triggers from the default branch (`main`). No error, no warning; `gh workflow run` returns 404. `pull_request` is unaffected.
- **CI once "lied"** because `lint`/`test` were wrapped in `|| echo`. If you see that pattern again, the gate is being disabled.

## Local dev environment

- **The local Docker Redis/Mongo (ports 6379/27017) is shared across every worktree and session** — there is no isolated db-index (the `REDIS_URL` db-index is ignored, see `tech-debt.md`). Consequences: another session's `test:integration` runs `queue.obliterate()` and resets the job-id counter in the middle of a load test (jobs vanish from `JobMetric`, error `"Missing key for job <n>"`); a live dev worker in another worktree grabs the test's jobs (`fallback-false-healthy.integration.test.ts` flakes). For a clean measurement, run a dedicated Redis (`docker run` on another port). CI is unaffected (its own containers).
- **Machine sleep/hibernate makes Docker Desktop stop containers** (`Exited`) while the Node process keeps running and fails with `ECONNREFUSED` continuously. The data is intact; run `docker start` again manually. `ScheduleWakeup` does not wake across a sleep.
- **`TaskStop` on `ts-node-dev --respawn`/`vite` does not always kill the whole process tree on Windows** — orphaned child processes hold the port, and a new server fails to bind silently. Check `Get-NetTCPConnection -LocalPort <port> -State Listen`, and `Stop-Process -Force` the old PID.

## MCP

- **GitHub MCP OAuth:** GitHub does not support Dynamic Client Registration (error `does not support dynamic client registration`) — you must use a pre-registered OAuth App: `client_id` `Ov23lijeoeW3qbp7cH35`, callback port `51004`, real callback URL `http://localhost:<port>/callback`. It still needs the `client_secret` despite PKCE (ask the repo owner through a secure channel):
  ```powershell
  $env:MCP_CLIENT_SECRET = "<secret>"
  claude mcp add --transport http --client-id Ov23lijeoeW3qbp7cH35 --client-secret --callback-port 51004 -s local github https://api.githubcopilot.com/mcp/
  ```
  Use an environment variable instead of pasting into the hidden prompt (PowerShell 5.1 can drop characters). `The socket connection was closed unexpectedly` usually just needs `/mcp` retried.
- **`claude mcp` run from a different shell → a different project key:** Git Bash writes `d:/...`, PowerShell writes `D:\...`, and they are treated as two projects. Manage MCP from the same shell you run `claude` in (in this repo: PowerShell).
