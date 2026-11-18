# TravelPlan

An AI travel planner that turns a destination and a few preferences into a day-by-day itinerary of real, verified places, plus `abkit`, the A/B testing and causal-inference toolkit used to measure it.

[![CI](https://github.com/tlamDson/TravelPlan/actions/workflows/ci-main.yml/badge.svg?branch=main)](https://github.com/tlamDson/TravelPlan/actions/workflows/ci-main.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**Live demo:** [plancare-web-omega.vercel.app](https://plancare-web-omega.vercel.app)

![Architecture: a traveler uses the React web app on Vercel, which calls the Express API; the API queues jobs on Redis and BullMQ workers build the itinerary with Gemini, Google Places and Mapbox, saving trips to MongoDB; Clerk handles sign-in; each trip moves from DRAFT to COMPLETED or FAILED; product events feed abkit, runs.csv and the CI gates](.github/readme/architecture.svg)

## What it does

- **Plans a trip from a short wizard:** pick a destination, dates, budget and interests; the itinerary is generated in the background while the page shows live progress.
- **Only suggests places that exist:** every place the AI proposes is checked against Google Places and Mapbox, then grouped by neighborhood so each day stays walkable.
- **Lets you work with the result:** view each day on a map, reorder stops, and regenerate any single stop you do not like.

## Results at a glance

Every number below comes from [`analytics/runs/runs.csv`](analytics/runs/runs.csv), and a test checks each one against it. Simulated users are labelled as simulated and are never counted as real users.

| What was tested                                                                                                   | Result                                                                                         | Why it matters                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Peeking at an A/B test every day, in 10,000 simulated tests where nothing really changed                          | 21.6% false alarms with a t-test vs 0.17% with mSPRT                                           | Teams can check a dashboard daily without being fooled by noise. <!-- source: fpr_ttest_daily_peek, fpr_msprt_daily_peek -->                                         |
| Measuring an email campaign's effect from 100 deliberately biased samples of a real experiment (Hillstrom)        | Error of 3.7 pp with a naive comparison vs -0.015 pp with a doubly robust (AIPW) estimate      | The true effect can still be recovered when the data is not a fair random split. <!-- source: hillstrom_ate_bias_naive_diff, hillstrom_ate_bias_aipw -->             |
| Planting bugs in the statistics code to see if CI catches them                                                    | 10 of 10 planted bugs blocked                                                                  | A broken statistics change cannot merge unnoticed. <!-- source: golden_gate_mutants_blocked -->                                                                      |
| Whether adopting GitHub Actions changed pull-request merge time, across 292 repositories                          | -17.6% estimate, but the 95% range includes no change: no detectable effect                    | The toolkit reports an honest "no effect" instead of overclaiming a win. <!-- source: did_att_pct_main, did_att_ci95_low_main, did_att_ci95_high_main -->            |
| Choosing which users get an offer on a fixed 10% budget, among 418,831 test users of a public ad dataset (Criteo) | +5.3% more conversions than picking the top-scored users (T-learner); -12.0% with an X-learner | The same budget buys more results with the right model, and the check catches the wrong one. <!-- source: m8_lp_gain_over_topk_t_b10, m8_lp_gain_over_topk_x_b10 --> |
| Forecasting the next 7 days of simulated daily active users                                                       | 8.9% average error with a seasonal-naive baseline vs 3.4% with ARIMA                           | Better forecasts mean fewer surprises when planning capacity. <!-- source: forecast_mape_dau_seasonal_naive, forecast_mape_dau_arima -->                             |

## What I built

Solo project: product, backend, frontend, analytics and CI.

- **Queue-based trip generation:** `POST /api/trips` validates, enqueues a BullMQ job and returns a `jobId` at once; a worker runs the pipeline step by step, reports progress and saves partial results, and every step checks the trip's state so retries are idempotent.
- **AI treated as an untrusted service:** Gemini only proposes place ideas; each one is verified through Google Places with field-masked requests (only the fields used are billed), cached in a MongoDB `PlaceCache`, and wrapped in a circuit breaker.
- **Shared Zod contracts:** `packages/shared` holds the schemas, types and error codes used by both the API and the web app, so a contract change breaks the build instead of production.
- **`abkit`:** a Python A/B testing and causal-inference toolkit (deterministic assignment, Welch and delta-method tests, CUPED, mSPRT, AIPW, staggered DiD, uplift modelling, forecasting), with every measurement appended to `runs.csv`.
- **CI gates:** required lint, unit-test, typecheck/build and Docker checks on every PR, plus an `abkit` golden-dataset gate in CI that must block every planted-bug mutant.

## Tech stack

| Area      | Stack                                                                   |
| --------- | ----------------------------------------------------------------------- |
| Web       | React 19, Vite, TanStack Query, Zustand, Tailwind, shadcn/ui, Mapbox GL |
| API       | Node 20, Express 5, Mongoose, Zod, Pino, Clerk                          |
| Jobs      | BullMQ on Redis                                                         |
| AI & maps | Gemini, Google Places, Mapbox                                           |
| Data      | MongoDB Atlas                                                           |
| Analytics | Python: `abkit`, `simkit`                                               |
| Deploy    | Vercel (web), Railway (API, worker, Redis), GitHub Actions              |

## Quick start

Needs Node 20+, Docker, and API keys in `backend/.env` (see [`.env.example`](.env.example)).

```bash
git clone https://github.com/tlamDson/TravelPlan.git && cd TravelPlan && npm install
docker compose up -d mongodb redis
npm run dev:api   # then npm run dev:web and npm run dev:worker in two more terminals
```

Environment variables, Redis/TLS, deployment, scripts and troubleshooting: [DEVELOPMENT.md](DEVELOPMENT.md).

## License

MIT — see [LICENSE](LICENSE).
