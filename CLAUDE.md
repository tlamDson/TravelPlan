# TravelPlan — rules for Claude Code

This file and `.claude/rules/*` are loaded into **every** session, so they hold only the project definition and the rules. Knowledge needed for only some tasks lives in `.claude/reference/` (table at the end of this file) — read it only when the task at hand needs it.

@.claude/rules/git-pr.md
@.claude/rules/tdd.md

## Part 1 — Project definition

**TravelPlan** is an agentic travel itinerary planner: the user creates a trip through a wizard, a worker calls Gemini to generate place intents, verifies them through Google Places/Mapbox, clusters them geographically, and builds a day-by-day itinerary.

**Stack:** TypeScript monorepo (npm workspaces + turbo, Node ≥ 20). Backend Express 5 + Mongoose 9 + BullMQ/ioredis, Zod, Pino, Clerk (`@clerk/express`), Gemini (not OpenAI; the model is pinned in `backend/src/config/gemini-models.ts`). Web React 19 + Vite 7 SPA (not Next.js), react-router v7, TanStack Query, Zustand, Tailwind + shadcn/ui, Mapbox GL. MongoDB Atlas, Redis. Python (`analytics/`, `services/`) uses its own venv.

**Actual layout** (`docs/agents/*.md` and `docs/PLAN.md` describe a different layout — do not look for `web/`, `api/`, `worker/`):

| Directory          | Contents                                                                                                                    |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `backend/`         | One workspace holding both the API (`src/index.ts` → `createApp()` in `src/app.ts`) and the BullMQ worker (`src/worker.ts`) |
| `frontend/web/`    | Main SPA                                                                                                                    |
| `frontend/mobile/` | Expo/React Native, early stage                                                                                              |
| `packages/shared/` | `@travelplan/shared`: shared Zod schemas, types, constants (built with `tsup`)                                              |
| `analytics/`       | Python: `abkit` (experimentation), `simkit` (simulation), `runs/runs.csv` (source of every B2 measurement) — B2 is done     |
| `services/`        | Python services for B3 — added incrementally                                                                                |
| `e2e/`             | Playwright, not part of any npm workspace                                                                                   |

**Backend layers:** thin controllers (validate Zod → call service → return JSON), services hold business logic, repositories only touch the DB and hold no logic. A controller that touches Mongoose directly is a review error.

- **Fire & Listen:** `POST /api/trips` validates → `tripQueue.add()` → returns `{ jobId }` immediately; the controller never `await`s trip generation. The worker calls `job.updateProgress()` at each step and saves partial results.
- **Trip state machine:** `DRAFT → QUEUED → PROCESSING → COMPLETED` (↘ `FAILED`); the worker checks `Trip.status` before each step (idempotent).
- **AI is an untrusted service:** AI never calls external APIs directly, only through tools in `backend/src/features/planner/tools/`; every place the AI generates must be verified through `searchPlaces`; an `opossum` circuit breaker wraps Places/Mapbox; AI retries at most 3 times, then fails gracefully.
- Itinerary pipeline (6 fixed steps): see the `itinerary-builder` skill.

**Shared Kernel:** `packages/shared` is the single source of truth for the data contract — only Zod schemas, TS types, error codes, constants; no UI, business logic or DB models. Cross-layer changes go in the order `packages/shared` → backend → frontend (run `npm run build:shared` after changing shared). When you change the analytics catalog (`schemas/analytics.schema.ts`), run `npm run export:json-schema -w packages/shared` to update `packages/shared/json-schema/` (Python reads that file; a parity test blocks drift). A new web event in the catalog must have a `track()`/`trackOnce()` call site from `@/features/analytics` in `frontend/web` — `tracking-coverage.test.ts` blocks it otherwise. When you change the group-assignment algorithm (`backend/src/features/experiments/services/assignment.ts`), run `npm run generate:assignment-vectors -w backend` to update `packages/shared/fixtures/assignment-vectors.json` (TS and Python both check against it).

**Repository Symmetry:** every domain has a mirrored presence in `frontend/web/src/features/<domain>/`, `backend/src/features/<domain>/` and (when there is a shared contract) `packages/shared/src/schemas/<domain>.ts`.

**Env:** declare a new variable in `backend/src/config/env.ts` (envalid, crashes at boot if a required variable is missing) **and** in `.env.example` — the `env-example-parity.test.ts` test blocks it otherwise. Log with Pino (`backend/src/lib/logger.ts`), never `console.log`; `logger.error({ err }, "msg")`.

**4 test layers** (setup details: `.claude/reference/test-infra.md`):

| Layer                   | Command                                                      | Notes                                                                                |
| ----------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| Shared + backend unit   | `npm run test -w packages/shared`, `npm run test -w backend` | Mock repository/queue with `vi.mock()`, never call real AI/Places                    |
| Frontend unit/component | `npm run test -w frontend/web`                               | MSW, `renderWithProviders`                                                           |
| Backend integration     | `npm run test:integration -w backend`                        | Real Mongo/Redis (`docker compose up -d mongodb redis`), shared DB `travelplan_test` |
| E2E Playwright          | `npm run e2e`                                                | Needs `.env.e2e`; CI job is not required                                             |

Common gate: `npm run lint`, `npm run typecheck`, `npm run build` (run `build:shared` first if you changed shared).
Python `analytics/abkit` and `analytics/simkit` (install abkit first): CI job `abkit Lint + Test` (`ruff check`, `ruff format --check`, `pytest -q` for each package; installs only core + dev), plus the golden gate `abkit golden --subset ci-fast --strict` + `abkit gate` (all 10 mutants must be blocked; see `analytics/golden/README.md`). The results tables in `analytics/abkit/README.md` and `docs/results.md` are generated from `runs.csv` by `python -m abkit.readme_results --write` (a test blocks drift); the resume bullets in `analytics/runs/resume-bullets.md` — every number must appear in the source table at the end of that file.

**Environments:** `develop` → staging (Railway env `staging` + Vercel Preview), `main` → production. 3 required checks on a PR: `Lint + Unit Tests`, `Typecheck + Build`, `Backend Docker Build`. Infrastructure details: `.claude/reference/deploy-ops.md`.

## Part 2 — Rules

**Authority** (per `Conductor/docs/authority.md` — `D:\Desktop\Conductor\docs\authority.md` on Lam's machine):

- Every change goes through a PR into `develop`; never commit/push directly to `develop` or `main`.
- A PR into `develop` may be self-merged when the 3 required checks are green **and** an independent review PASSes (squash).
- Releasing `develop` → `main` follows the charter above; outside that charter `main` belongs to the repo owner — a broad phrase like "do it all" is not authorization to merge `main`. A `main` merge is a real merge commit, not a squash.
- **Maximum cost $0:** do not enable paid services, do not exceed the free tier/credits. If you are unsure whether something costs money, assume it does and do not do it.

**Two kinds of session:**

- **Conductor headless session:** work in the assigned worktree (no `EnterWorktree`); no `/pr`, `/ci-watch`, `ScheduleWakeup`; no merging; no waiting for CI. Commit → push → open PR → stop; the last line prints exactly one of `RESULT: pushed <PR number>`, `RESULT: failed <reason>`, `RESULT: blocked <what the repo owner must do>`. Do not edit `.claude/settings*.json`, `.claude/scripts/` or hooks.
- **Manual session:** call `EnterWorktree` before editing the first file, move the branch to `origin/develop` (see `.claude/rules/git-pr.md`). `/pr` and `/ci-watch` are optional.

**TDD:** the first commit contains only red tests; run them and see them fail for the right reason; the PR has a `## RED` section pasting that red output. Never commit new code without tests. Details: `.claude/rules/tdd.md`.

**File size:** one responsibility per file; split when a file mixes several jobs or grows past about 300 lines. There is no hard cap any more — an older, longer file is not debt that must be paid down right away.

**Data safety:**

- Zod at every inbound boundary (request, API response, AI output, files read in).
- AI output: `sanitize-html` before writing to MongoDB, `DOMPurify` before rendering; bare `dangerouslySetInnerHTML` is forbidden.
- Never read, print or commit secrets (`.env*`, keys, tokens).
- Tests never touch the production DB — only `travelplan_test`, `travelplan_e2e`, local Docker or offline data.
- PII (email, Clerk userId, IP…) must be hashed before it enters the analytics layer (`analytics/`, events stored for analysis).

**Honest measurements:** every number in a README must appear in `analytics/runs/runs.csv`. Simulated users are always labeled "simulated"/"virtual users" and counted separately from real users; simulation results are worded as "recovered a known injected effect".

**Python in `analytics/` and `services/`:** a separate venv per worktree (`analytics/.venv`, installed with `pip install -e ".[dev]"`), pin dependency versions, `ruff check`, `ruff format --check`, `pytest -q` green before pushing.

**Token economy:** run only the tests related to the change, with a compact reporter (`npx vitest run <files> --reporter=dot`, `pytest -q`); run full lint/typecheck/test once before pushing. Read files in `.claude/reference/` only when the task needs them. Do not paste the plan or long summaries back.

**Tech debt:** a bug found outside the scope of the current work is not fixed on the spot — write a test asserting the current behavior marked `[BUG]`, then record it in `.claude/reference/tech-debt.md` with all 3 parts: symptom, cause with `file:line`, trigger condition. When it is fixed, delete the entry in the same commit.

**Keep the rules current:** work that changes a convention, tooling or process updates `CLAUDE.md`/`.claude/rules/*` (rules) or `.claude/reference/*` (knowledge) in the same PR. PR history does not go here — git already has it. Do not create new `.md` files in the root (only `README.md`, `CLAUDE.md`). The test `backend/src/config/claude-docs-parity.test.ts` keeps the auto-loaded part under 24 KB.

## Reference on demand (`.claude/reference/`, not auto-loaded)

| File                                 | Read when                                                                                                              |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `.claude/reference/pitfalls.md`      | Touching BullMQ/Redis, Mongoose, Pino, CORS, Gemini quota, CI workflows, MCP/OAuth, local Docker, Windows shell        |
| `.claude/reference/tech-debt.md`     | Before changing a module (check for known bugs); when recording new debt                                               |
| `.claude/reference/deploy-ops.md`    | Railway, Vercel, staging, Sentry, Mongo backup, GCP billing/quota, `railway.toml`                                      |
| `.claude/reference/test-infra.md`    | Setting up/changing integration tests, Playwright E2E, RAG eval, `abkit` golden, the measurement scripts (`measure:*`) |
| `.claude/reference/ui-design.md`     | Any UI change in `frontend/web`: `ui-ux-pro-max` pre-flight, UI conventions, 3-language i18n, `data-testid`            |
| `.claude/reference/debug-browser.md` | Fixing bugs observable in the browser (verify with `chrome-devtools` before and after the fix)                         |

Skills in `.claude/skills/` (`itinerary-builder`, `rag-destinations`, `travelplan-devops`, `ui-ux-pro-max`, `ui-styling`) load automatically by description. MCP: `github`, `chrome-devtools` declared in `.mcp.json` (OAuth pitfalls in `pitfalls.md`).
