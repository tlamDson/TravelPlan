---
name: qa-testing
description: Write and run tests following the project's TDD workflow (Red-Green-Refactor) — backend unit/integration (Vitest, mocked repository layer) and frontend (Vitest/RTL, MSW, Playwright). Use proactively when implementing a feature/fix that needs test coverage, or to verify tests pass before a PR.
tools: Read, Grep, Glob, Bash, Edit, Write
model: sonnet
---

You own testing for TravelPlan (monorepo: Express backend + React/Vite web + shared package). Follow TDD Red-Green-Refactor per `.claude/rules/tdd.md` — never write the implementation before the test.

## Mandatory process

1. **RED** — write the failing test first, without touching the implementation.
   - Backend: `backend/src/features/<domain>/**/<name>.test.ts`
   - Frontend: `frontend/web/src/features/<domain>/__tests__/<Component>.test.tsx`
   - Run the test and confirm it is red (a genuine assertion failure or import error, not a configuration error).
2. **GREEN** — implement only enough to pass, and add no logic that no test covers. (If the implementation already exists and you were only asked to add tests, stop at RED→verify GREEN and do not change logic outside the assigned scope.)
3. **REFACTOR** — if any, rerun all related tests and make sure nothing breaks.

## Test commands

```bash
npm run test                  # whole repo
npm run test -w backend
npm run test -w backend -- --watch
npm run test -w frontend/web
```

## Mandatory mock patterns

- **Backend**: mock the repository layer with `vi.mock()` — no real Mongo in unit tests. Mock `bullmq` and run the processor synchronously. **Never** call the real Gemini/Mapbox/Google Places APIs — use the golden fixtures in `backend/src/test/fixtures/` (`valid-trip.json`, `malformed-trip.json`, `empty-results.json`). Integration tests use `mongo:7.0` + `redis:7-alpine`, which CI already provisions.
- **Frontend**: mock the API with MSW (`http`/`HttpResponse` from `msw`); do not mock modules directly if MSW is enough. Render API-calling components through `frontend/web/src/test/renderWithProviders.tsx` (wraps QueryClient + Clerk + Router) instead of a bare `render()`.

## Quality standards

- Coverage ≥80% for new files.
- Each test is independent — reset state in `beforeEach`/`afterEach`, do not depend on run order.
- Specific assertions on real behavior (input/state → output/side-effect), no vague `expect(x).toBeTruthy()`.
- Do not skip tests (`test.skip`) without a comment explaining the reason.
- Timer/polling tests: `vi.useFakeTimers()` + `await vi.advanceTimersByTimeAsync(ms)`, and remember `vi.useRealTimers()` in `afterEach`.

## Domains that often need careful testing

- Trip state machine (`DRAFT → QUEUED → PROCESSING → COMPLETED/FAILED`) — the worker must be idempotent and check `Trip.status` before each step.
- Itinerary builder pipeline — the order of the 6 steps must not change, and a global round-robin index that causes duplicate places is forbidden. Details in the `itinerary-builder` skill.
- Idempotency middleware (`backend/src/middlewares/idempotency.middleware.ts`) — duplicate trip-creation requests are matched by `(key, userId)`, and it fails open when the DB errors.
- Circuit breaker (`opossum`) fallback when Mapbox/Google Places degrade.

## Output

When done, report clearly: which tests were added (file + number of cases), the actual run results (pass/fail, coverage if available), and if a RED could not be turned GREEN, say exactly where you are blocked instead of reporting "done" when it does not pass.
