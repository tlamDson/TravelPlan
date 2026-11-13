# Test and measurement infrastructure

TDD process: `.claude/rules/tdd.md`. This file holds setup details and pitfalls.

## Backend unit (`backend/vitest.config.ts`)

`include: ["src/**/*.test.ts"]`, **exclude** `*.integration.test.ts`. `test.env` presets the required envalid variables (`MONGO_URI`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SIGNING_SECRET`, `GEMINI_API_KEY`, `STRIPE_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`) to stay hermetic. The dummy `CLERK_WEBHOOK_SIGNING_SECRET` must be valid base64 after `whsec_` (svix throws at construction). Repo-level guards: `config/env-example-parity.test.ts` (`.env.example` covers every envalid key), `config/claude-docs-parity.test.ts` (the auto-loaded Claude rules stay small, the references exist, the Claude docs are in English).

## Backend integration (`backend/vitest.integration.config.ts`)

- Real Mongo + Redis: `docker compose up -d mongodb redis` (`travelplan_admin`/`dev_password_change_in_prod`, db `travelplan_test`). Setup `backend/src/test/integration-setup.ts`: env fallback with `??=`, clears the collections after each test, obliterates the `trip-generation` queue in `afterAll`.
- `GOOGLE_PLACES_API_KEY`/`MAPBOX_ACCESS_TOKEN` are unconditionally assigned `= ""` — `config/env.ts` loads `backend/.env` before setup, so `??=` would let the real key through and bill real Places.
- `supertest` + `createApp()` (`backend/src/app.ts` builds the app without connecting to the DB or binding a port). Auth: `resolve.alias` points `@clerk/express` at `backend/src/test/clerk-express.stub.ts` (header `x-test-user-id`) — no separate `vi.mock` needed.
- `fallback-false-healthy.integration.test.ts` runs a real BullMQ `createWorker()`; `worker-lock-duration.integration.test.ts` builds a stall with a busy-loop child process. These two files flake if another worktree has a live worker on the local Redis (see `pitfalls.md`).

## Frontend (`frontend/web/vitest.config.ts`)

`src/test/renderWithProviders.tsx` (components, `gcTime: 0`) and `src/test/renderHookWithQuery.tsx` (hooks, **not** `gcTime: 0` because a hook reads/writes the cache with no subscriber). Factories in `src/test/factories/` (`makeTrip`, `makeActivity`). `src/test/setup.ts` polyfills `ResizeObserver`/`IntersectionObserver`/`matchMedia`/`scrollIntoView` (stubs, they do not simulate real sizes). `npm run typecheck -w frontend/web` runs `tsc -p tsconfig.app.json`.

## E2E Playwright (`e2e/`)

- `npm run e2e` (skips `@live`), `npm run e2e -- --ui`. Specs: `auth`, `wizard-navigation`, `wizard-paywall`, `create-trip` (zero AI spend — there is no worker). `@live` specs that call real Gemini/Places do not exist yet.
- Auth: the `setup` project signs in through `clerk.signIn()` (Backend API) → `e2e/.auth/user.json`; `auth.spec.ts` runs in `chromium-anon`. The fixture `e2e/support/fixtures.ts` calls `setupClerkTestingToken` for every test.
- DB `travelplan_e2e`, dropped on every run in `global-setup.ts` (hard URI guard; free tier 10 trips/month). Do not add a test-only reset route to the API.
- Clerk **test instance** credentials: `.env.e2e` locally, the secrets `CLERK_*_E2E`/`E2E_USER_*` on CI; `global-setup.ts` throws if the key is `pk_live_`/`sk_live_`.
- `playwright.config.ts`'s `apiEnv` must supply `CLERK_WEBHOOK_SIGNING_SECRET`, `GEMINI_API_KEY`, `STRIPE_SECRET_KEY` itself — locally `backend/.env` hides the problem, CI does not.
- A relative-string `storageState` resolves against `process.cwd()` — use `path.resolve(__dirname, …)`.
- `DatePicker` (react-day-picker v9): the day label is `format(date, "PPPP")`; StepBasics has 2 pickers at once → scope by popover (`e2e/support/date-picker.ts`'s `pickDate()`).
- `[data-testid^="trip-card-"]` also matches `trip-card-title` — add a tag scope (`div[...]`).
- `TripStatusBadge` has a testid, but check whether it is actually rendered on the page before writing a spec that depends on it; the cancelled state is observed through `AgentLockBanner` disappearing.
- `e2e/` belongs to no workspace → root lint/typecheck does not touch it. When in doubt, run `npx tsc --noEmit --strict …` by hand.
- The CI job `E2E (Playwright)` is not required; service containers `mongo:7.0` + `redis:7-alpine`.

## RAG eval (`backend/src/lib/rag-eval/`)

Pure metrics (`recallAtK`, `precisionAtK`, `mrr`, `ndcgAtK`, `hitRate`, tests computed by hand), 5 constraint checks that cost no LLM (`geoOutliers` uses the **median**, not the mean), an offline corpus snapshot, a golden set + a labeling CLI, an offline runner with baseline/BM25/RRF/query rewrite with a cache. Real corpus: staging `travelplan_staging`, 26 cities (`npm run seed:eval-corpus` costs real Serper + Gemini). `Trip.generationMeta` records `ragUsed`/`ragResultCount`/`model`/`aiAttempts`/tokens/`latencyMs` on every trip generation (backend model only).

## `abkit` golden (`analytics/golden/`)

`python -m abkit golden [root] [--strict]` runs the engine on each case and prints PASS/FAIL/MISSING/ERROR against the tolerances in `truth.json`; a method with no implementation yet (registered in `abkit/golden/methods.py`) is MISSING, and is red only with `--strict`. The G-ref answers are computed with scipy/statsmodels in `abkit/golden/ref_truth.py` (imports nothing from abkit; an AST test enforces this). A frozen case is not edited — to change it, freeze into `v2/` with `python -m abkit.golden.freeze_ref` (needs the `[golden]` extra). Format and the contract of each method: `analytics/golden/README.md`. G-public Hillstrom (`v2/hillstrom/`) takes the published numbers (Radcliffe 2008), frozen with `python -m abkit.golden.freeze_public <raw.csv>`; the raw file lives at `D:\data\b2\hillstrom.csv` (or `ABKIT_HILLSTROM_CSV`), not committed — the test that recomputes from the raw file skips itself when the file is absent (as on CI). G-public LaLonde NSW (`v2/public/`, Dehejia & Wahba 1999 numbers) is frozen with `python -m abkit.golden.freeze_lalonde <directory of DW raw files>` (the sha256 of the raw files is pinned in code); the raw files and Hillstrom live outside the repo at `D:/data/b2/`, and the tests that compare against the raw files skip themselves when they are absent.

G-sim (`v1/sim-*`, 50 simulated cases) is frozen with `python -m simkit.freeze_golden` (install simkit after abkit): the correct decision comes from the preset parameters, the correct estimate is the true effect computed from both potential outcomes of the same virtual user; the seeds are screened with an independent scipy readout and the number of attempts is recorded in `source.screening`. `--subset ci-fast` (`v1/subsets.json`) is the subset for the CI gate; `SIMKIT_GOLDEN_FULL=1` rebuilds all 50 cases (run nightly).

The golden gate (PR 15a, M10): the required job `abkit Lint + Test` runs `abkit golden --subset ci-fast --strict`, then `abkit gate`. `abkit gate` installs the 10 mutants in `abkit/golden/mutants.py` into a temporary copy of the package and runs each one in a fresh interpreter; a mutant that turns no case red makes it exit 1. G-event runs through `simkit`'s `tests/test_catalog.py`. The workflow `abkit-golden-nightly.yml` runs all cases with `SIMKIT_GOLDEN_FULL=1`; `schedule` only runs from `main`. If an engine change alters exactly a line a mutant patches, `test_golden_mutants.py` goes red: move the mutant to the new line, do not delete it.

## B2 results tables and bullets (`analytics/abkit/src/abkit/readme_results.py`)

A `ResultSpec` selects one `runs.csv` row by `metric` (the last row wins, so a rerun replaces the old number) and sets the `simulated` flag; a flag that disagrees with `runs.csv` is an error, so simulated numbers do not leak into the "Real data" table. To add a new measurement to the README: add a `ResultSpec`, run `analytics/.venv/Scripts/python -m abkit.readme_results --write`. `analytics/runs/resume-bullets.md` has a `metric | value` source table; `test_resume_bullets.py` compares each value (4 significant digits) with `runs.csv`. After each rerun of a measurement, rewrite the bullet and the source table. Simulated bullets say "simulated"; the B2 bullets do not use the CUPED number as a headline (on Hillstrom it only reduces variance by 0.64%).

## `simkit` Locust driver (B2 PR 16)

`analytics/.venv/Scripts/python -m simkit.driver --users 1000 --vus 1000 [--duplicate N ...] [--dry-run]` (install `analytics/simkit[load]`, needs `docker compose up -d mongodb redis`). The driver clears and then writes the local DB `travelplan_sim*` (it refuses a non-loopback host or any other DB name), boots the backend itself with `node --import tsx src/index.ts` with fake keys and `ANALYTICS_SIM_INGEST=true` (route `POST /api/analytics/sim/events`: no rate limit, allows exposure `source: "server"`, accepts only `sim-` userIds; boot crashes if `NODE_ENV=production`). Locust runs as a separate process (gevent monkey-patch), and the plan/tally go through `SIMKIT_PLAN`/`SIMKIT_TALLY`. Then `analytics:export` for each day, reconcile sent/ingest/Mongo/export against the loss manifest, and compare the `abkit` readout on the export with the readout on the simulated events; write a `simulated=true` row into `runs.csv`, and exit 1 on a mismatch. The pytest tests use `tests/fake_ingest.py` in place of the backend; the real route has the integration tests `analytics-sim-ingest*.integration.test.ts`.

## Measurement scripts (`backend/scripts/`, read-only unless noted)

| Command                                                                                 | Measures                                                                                                                                                                                                                                                |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run measure:false-healthy -w backend -- --simulate\|--retrospective`               | How long the SLO dashboard wrongly reports "healthy" during FALLBACK                                                                                                                                                                                    |
| `npm run measure:pipeline -w backend -- --harvest --redis-url=<url>` then `-- --report` | p95/stall from the Redis job history (limited by retention)                                                                                                                                                                                             |
| `npm run measure:achieved-slo -w backend`                                               | Real SLI/error budget over `JobMetric`                                                                                                                                                                                                                  |
| `npm run seed:real-trip-jobs`                                                           | Load test with real Gemini + Places (costs quota)                                                                                                                                                                                                       |
| `npm run check:services [-- --strict]`                                                  | Ping Mongo/Redis/Clerk/Gemini/Places/Mapbox                                                                                                                                                                                                             |
| `npm run analytics:export -w backend [-- --day=YYYY-MM-DD --out=<dir>]`                 | Exports one UTC day of `analytics_events` (default yesterday) → `analytics/data/events/events-<day>.jsonl.gz`, ids hashed; needs the same `ANALYTICS_HASH_SECRET` as ingest                                                                             |
| `npm run seed:experiments -w backend`                                                   | Writes the experiment catalog (`packages/shared/src/constants/experiments.ts`) into `experiments` as `draft`, without touching existing docs; enabling an experiment = the repo owner changes `status` to `running` and sets `EXPERIMENTS_ENABLED=true` |

A clean load test needs a dedicated Redis (see `pitfalls.md`); compare `redis-cli get bull:trip-generation:id` against the `JobMetric` count to tell whether jobs went missing. The Reliability API has a 3-layer gate: `ENABLE_RELIABILITY_API` → Clerk → `SRE_ADMIN_EMAILS`; the `/reliability` dashboard deliberately has no menu link.
