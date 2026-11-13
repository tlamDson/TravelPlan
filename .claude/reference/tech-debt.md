# Verified technical debt

Do not fix on your own unless assigned. Each entry has 3 parts: **symptom**, **cause** (`file:line`), **trigger condition**. When it is fixed, delete the entry in the same commit. Line numbers may drift over time — grep by function name.

## Backend

- **`intent-parser.service.ts`'s `extractJson()` breaks on a bare JSON array**
  - Symptom: an AI response shaped as an array without a code fence is cut wrongly, parsing fails, and it falls into retry/fallback.
  - Cause: `backend/src/features/planner/services/intent-parser.service.ts:61` — the fallback branch only cuts on `{`…`}`, even though `coerceRoot()` has a branch that handles arrays.
  - Trigger: Gemini returns a bare array without ` ```json `.
- **`activity-regen.service.ts`'s `recalcDayDistances()` returns 500 when an activity has no coordinates**
  - Symptom: `PATCH /trips/:id/reorder-activities` or `POST /trips/:id/regen-activity` returns 500 (`CastError` on `Trip.save()`).
  - Cause: `backend/src/features/planner/services/activity-regen.service.ts:47` — the guard treats `coordinates: []` as having coordinates (`[]` is truthy); Mongoose sets an empty array itself → `validateDistance()` yields `NaN`.
  - Trigger: `validationService` cannot find coordinates for the replacement activity. Test: `trip-activities.integration.test.ts`.
- **`redis-options.ts` ignores the db-index of `REDIS_URL`**
  - Symptom: `redis://host:6379/1` connects to db 0.
  - Cause: `backend/src/lib/redis-options.ts:44` — `buildRedisConnectionOptions()` does not read `u.pathname`.
  - Trigger: wanting to isolate environments by db-index on the same Redis (e.g. E2E/load-test next to dev). Test: `redis-options.test.ts` (`[BUG] REDIS_URL db-index is dropped`).
- **`job-outcome.ts`'s `normalizeFailureReason()` maps the most common error to `UNKNOWN`**
  - Symptom: the error breakdown on `/reliability` cannot separate "AI quota exhausted" from "AI really broken".
  - Cause: `backend/src/features/reliability/services/job-outcome.ts:55` — `FAILURE_PATTERNS` does not match `"AI failed to generate valid intents after 4 attempts"`; `ai-agent.service.ts` re-throws and drops the original string (which contains "429"/"quota").
  - Trigger: the Gemini quota runs out and `generateIntents()` exhausts its retries. Test: `job-outcome.test.ts` (`[BUG] maps the real 'AI failed…'`).
- **`trip.processor.ts` (~450 lines) and `ai-agent.service.ts` (~330 lines) mix several responsibilities**
  - Symptom: hard to test each pipeline step on its own; changing one step easily touches another.
  - Cause: `backend/src/features/planner/jobs/trip.processor.ts`, `backend/src/features/planner/services/ai-agent.service.ts`.
  - Trigger: any change to the trip-generation pipeline. If assigned, split following the pattern already used for `trip.controller.ts` (7 files by use case).
- **Many `any` in the backend**, mostly `catch (error: any)` (ESLint currently only warns, see `backend/eslint.config.mjs`). Trigger: type errors get hidden during a refactor.

## Frontend

- **`LatencyChart.tsx` draws an empty bar chart on the first load of `/reliability`**
  - Symptom: the axes, legend and `ReferenceLine` are right but the 9 `<Bar>`s are 0px tall; Recharts console `"width(-1) and height(-1)…"`. Resizing the viewport makes the bars appear.
  - Cause (suspected): `frontend/web/src/features/reliability/components/LatencyChart.tsx:73` — `ResponsiveContainer` measures before the parent layout is stable, and the mount animation caches a height of 0.
  - Trigger: opening the page with real latency data. Not reproducible in jsdom (the `ResizeObserver` polyfill is only a stub) — verify with `chrome-devtools`.
- **19 shadcn components in `frontend/web/src/components/ui/` are not imported** (accordion, breadcrumb, carousel, chart, table, tabs, sheet, sidebar, menubar, drawer, pagination, scroll-area, collapsible, context-menu, hover-card, input-otp, navigation-menu, aspect-ratio, resizeable). Kept deliberately; do not `npx shadcn add` more unless they are used right away.

## Infrastructure

- **Production Redis keeps job history only per `DEFAULT_JOB_RETENTION`** (complete 7 days, fail 30 days) — `measure-pipeline.ts --harvest` cannot measure anything older than that window. The long-term source is `Trip.generationMeta`/`JobMetric` in Mongo.
- **The reliability code (`backend/src/features/reliability/`) was not on `main`** at the last check — production does not write `JobMetric` yet; recheck with `git ls-tree origin/main backend/src/features/reliability`.

## Checked, not a bug (do not investigate again)

- `PATCH /api/users/me` with `{ tier: "pro" }` does not upgrade the user — the Zod `updateUserSchema` strips unknown fields (`users.integration.test.ts`).
- `budget-validator.service.ts`'s `convertToUSD` multiplying by the rate **looks correct**: the `rates` table is USD per one unit of foreign currency (JPY `0.0067`, 3000 JPY ≈ $20). The test `budget-validator.service.test.ts`'s `[BUG #8]` still calls this a bug — a person has to decide before "fixing" the conversion direction.
