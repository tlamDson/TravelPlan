# TDD — Red → Green → Refactor

1. **RED** — write the test first, and the first commit contains only the test. Run it and confirm it is red for the right reason (an assertion fails or an import does not exist yet — not a configuration error). Keep the red output for the `## RED` section of the PR.
2. **GREEN** — the minimum code to pass; add no logic that no test covers.
3. **REFACTOR** — clean up, rerun the related tests, and do not break them.

## Where tests go

| Kind                | Location                                                                                                    |
| ------------------- | ----------------------------------------------------------------------------------------------------------- |
| Backend unit        | `backend/src/features/<domain>/**/<name>.test.ts`                                                           |
| Backend integration | `backend/src/test/integration/<name>.integration.test.ts`                                                   |
| Frontend            | `frontend/web/src/features/<domain>/__tests__/<Name>.test.tsx` (or `hooks/__tests__/`, `stores/__tests__/`) |
| Shared              | `packages/shared/src/schemas/__tests__/`                                                                    |
| Python              | `analytics/<pkg>/tests/test_<name>.py`, `services/<svc>/tests/`                                             |

## Conventions

- Unit: mock repository/queue with `vi.mock()`; never call real Gemini/Places/Mapbox — use fixtures in `backend/src/test/fixtures/`.
- Integration: real Mongo/Redis through `supertest` + `createApp()`; auth through the existing `@clerk/express` stub (header `x-test-user-id`). A new route, or a route that branches on state/permission/tier, must have an integration test. The `travelplan_test` DB is shared — run only the integration files you changed, and only when `docker compose` has `mongodb` + `redis` up.
- Frontend: mock the API with MSW; render API-calling components through `renderWithProviders`, hooks through `renderHookWithQuery`.
- Timers/polling: `vi.useFakeTimers()` + `await vi.advanceTimersByTimeAsync(ms)`, `vi.useRealTimers()` in `afterEach`.
- Tests are independent, with assertions on specific behavior (no vague `toBeTruthy()`). No `test.skip` without a stated reason. Coverage ≥ 80% for new files.
- Out-of-scope bug: a test asserting the current behavior with a `[BUG]` comment, recorded in `.claude/reference/tech-debt.md`.
