# Results

Every number here is a row of `analytics/runs/runs.csv`, rendered by
`python -m abkit.readme_results --write`; a test fails when this page is stale.
Simulated users are never mixed with real ones.

<!-- results:start -->
**Real data**

| Result | Value | n |
| --- | --- | --- |
| M4: CUPED variance reduction, Hillstrom visit | 0.006414 fraction | 42,613 |
| M4: CUPED variance reduction, Hillstrom spend | 0.0004378 fraction | 42,613 |
| M4: CUPED sample-size multiplier, Hillstrom visit | 1.006 x | 42,613 |
| M4: CUPED sample-size multiplier, Hillstrom spend | 1 x | 42,613 |
| M6: Hillstrom ATE bias, naive difference (biased resamples) | 3.711 pp | 100 |
| M6: Hillstrom ATE bias, IPW | -0.01959 pp | 100 |
| M6: Hillstrom ATE bias, AIPW | -0.01504 pp | 100 |
| M6: LaLonde NSW+PSID ATT error, naive difference | -1.7e+04 USD | 2,675 |
| M6: LaLonde NSW+PSID ATT error, IPW | 1234 USD | 2,675 |
| M6: LaLonde NSW+PSID ATT error, AIPW | 818.8 USD | 2,675 |
| M7: DiD ATT, GitHub Actions on PR merge time (log1p hours) | -0.1936 log1p hours | 292 |
| M7: DiD ATT 95% CI low (log1p hours) | -0.6852 log1p hours | 292 |
| M7: DiD ATT 95% CI high (log1p hours) | 0.298 log1p hours | 292 |
| M7: DiD ATT as a change in merge time | -17.6 % | 292 |
| M7: pre-trend test p-value | 0.4345 p | 292 |
| M8: Criteo LP gain over top-k, T-learner, 10% budget | 5.3 % | 418,831 |
| M8: Criteo LP gain over top-k, T-learner, 20% budget | 9.348 % | 418,831 |
| M8: Criteo LP gain over top-k, T-learner, 30% budget | 3.671 % | 418,831 |
| M8: Criteo LP gain over top-k, X-learner, 10% budget | -12.02 % | 418,831 |
| M8: Criteo LP gain over top-k, X-learner, 20% budget | -9.98 % | 418,831 |
| M8: Criteo LP gain over top-k, X-learner, 30% budget | -15.95 % | 418,831 |
| M10: planted mutants blocked by the golden gate (of 10) | 10 mutants | 10 |
| M10: golden cases passing (G-ref + G-public) | 1 share | 29 |
| G-B2-1 data: sampled repos with a usable panel | 293 repos | 400 |
| G-B2-1 data: repos that adopted GitHub Actions | 103 repos | 400 |
| Assignment throughput | 8.498e+05 assignments/s | 10,000 |

**Simulated (virtual users)**

These rows come from virtual users, counted apart from real users. Each reports whether abkit recovered a known injected effect, not an effect on real people.

| Result | Value | n |
| --- | --- | --- |
| M1: false positive rate, t-test read once at the end | 0.0477 proportion | 10,000 |
| M1: false positive rate, t-test read every day | 0.2155 proportion | 10,000 |
| M1: false positive rate, mSPRT read every day | 0.0017 proportion | 10,000 |
| M3: 95% interval coverage, Welch read once | 0.9502 proportion | 10,000 |
| M3: 95% interval coverage, Welch at every peek | 0.7742 proportion | 10,000 |
| M3: 95% sequence coverage, mSPRT at every peek | 0.9981 proportion | 10,000 |
| M2: power at 50,000 users per experiment, Welch | 0.579 proportion | 1,000 |
| M2: power at 50,000 users per experiment, analytic | 0.5485 proportion | 1,000 |
| M5: ATE bias at 50,000 users (injected effect known) | 0.01852 pp | 1,000 |
| M5: ATE 95% interval coverage at 50,000 users | 0.957 proportion | 1,000 |
| M9: DAU forecast MAPE, seasonal naive | 8.942 % | 350 |
| M9: DAU forecast MAPE, ETS | 3.843 % | 350 |
| M9: DAU forecast MAPE, ARIMA | 3.439 % | 350 |
| M9: DAU 95% forecast interval coverage, seasonal naive | 0.9571 share | 350 |
| M9: DAU 95% forecast interval coverage, ETS | 0.7771 share | 350 |
| M9: DAU 95% forecast interval coverage, ARIMA | 0.8286 share | 350 |
| M9a: events failing the schema (1,000 driver VUs) | 0.0009615 share | 41,600 |
| M9a: duplicate events (1,000 driver VUs) | 0.01202 share | 41,600 |
| Ingest throughput (1,000 driver VUs) | 1.345e+04 events/s | 41,600 |
| M11: Cohen's kappa, memo vs labels | 1 kappa | 30 |
| M11: Cohen's kappa, p < 0.05 baseline vs labels | 0.8182 kappa | 30 |
<!-- results:end -->
