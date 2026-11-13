# abkit

Experimentation toolkit for TravelPlan (B2 plan): deterministic variant assignment,
A/B statistics (Welch, delta method, CUPED, SRM, mSPRT), causal estimators, uplift and
forecasting, and a golden dataset that gates the engine in CI.

The PyPI distribution is **`abkit-experiments`** (the name `abkit` on PyPI belongs to
someone else). The import name and the command stay `abkit`.

```bash
pip install abkit-experiments            # core: numpy, scipy
pip install "abkit-experiments[uplift,forecast]"
```

## Quickstart

```python
import numpy as np

from abkit.assignment import assign_variant, parse_definition
from abkit.stats import welch_ttest

experiment = parse_definition(
    {
        "key": "save-trip-cta-v1",
        "salt": "demo-salt",
        "holdoutBuckets": 0,
        "variants": [{"key": "control", "weight": 5000}, {"key": "treatment", "weight": 5000}],
    }
)
rng = np.random.default_rng(7)
control, treatment = [], []
for i in range(4000):  # 4,000 simulated users
    _, variant = assign_variant(experiment, f"user-{i}")
    lift = 0.3 if variant == "treatment" else 0.0  # a known injected effect
    (treatment if variant == "treatment" else control).append(rng.normal(1.0 + lift, 1.0))
result = welch_ttest(control, treatment)
print(f"estimate={result.estimate:.3f} p={result.p_value:.2g} (injected effect: 0.3)")
```

## Results

Every number below is a row of `analytics/runs/runs.csv`, rendered by
`python -m abkit.readme_results --write` (a test fails when this block is stale).
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

## What is in the package

Modules and commands:

- `abkit.assignment`: deterministic variant assignment. It matches the server
  (`backend/src/features/experiments/services/assignment.ts`) on all rows of
  `packages/shared/fixtures/assignment-vectors.json`.
- `abkit.stats`: Welch's t-test, the delta method for ratio metrics, the SRM
  chi-square check (threshold `p < 0.0005`), and power / sample size / MDE for
  the two-sample t-test and two proportions (Cohen's h). Estimates are
  treatment minus control. Bad input raises `ValueError`, so a function never
  returns NaN. These must pass the golden G-ref cases of each method.
  It also has the mSPRT (normal mixture, Johari et al.): always-valid p-values
  and confidence sequences that may be read after every look, and
  Benjamini-Hochberg FDR adjustment across metrics.
- `abkit.stats.cate_by_group`: CATE by a discrete covariate such as persona: a
  Welch test inside each group, the inverse-variance pooled effect, and Cochran's
  Q (chi-square, K-1 df) for "do the groups share one effect?".
- `abkit.peeking`: simulated A/A experiments (virtual users) read every day for
  14 days, for the daily-peek false positive rate of the t-test against the
  mSPRT (M1), and the coverage of 95% intervals under an injected effect (M3).
  It appends its rows to `runs.csv` (`simulated=true`).
- `abkit.stats.cuped`: CUPED (Deng et al., 2013) with a pooled `theta`; it
  reports `variance_reduction` (R²) and `sample_size_multiplier` = `1/(1-R²)`,
  the users an unadjusted test needs per CUPED user. `cuped_sample_size(n, R²)`
  is `n (1-R²)`.
- `abkit.hillstrom`: loads the Hillstrom (MineThatData 2008) e-mail test and
  checks its SHA-256. The raw file lives under `D:\data\b2\`, not in git.
- `abkit.cuped_check`: bootstraps CUPED on Hillstrom (Mens E-Mail vs No E-Mail,
  1,000 resamples) and logs metric M4 to `runs.csv`.
- `abkit.causal`: naive difference, IPW and AIPW (doubly robust) for the ATE or ATT, with
  logistic propensity and OLS outcome models from term lists (`age`, `age^2`,
  `u74*black`). `python -m abkit.causal.m6` measures M6: the ATE error of each method on
  biased resamples of the Hillstrom RCT (real file outside the repo, e.g.
  `D:/data/b2/hillstrom/hillstrom.csv`) and on the G-public LaLonde NSW/PSID cases.
- `abkit.readout` (PR 15): one experiment readout and its one-page Markdown memo. The
  SRM chi-square check runs first; when it fails (`p < 0.0005`) the memo says
  CONCLUSION BLOCKED, shows the counts per arm and withholds every effect. Otherwise the
  primary metric (Welch for a mean, delta method for a ratio) is tested once at the
  planned horizon: SHIP when `p < alpha` and the effect is positive, else NO SHIP (a
  significant drop is called out as harm). Interim looks are listed but never decided on,
  the early window is shown as a novelty check, and `by_persona` adds a persona table with
  Cochran's Q. It answers the 50 G-sim cases (`readout` method). A memo of simulated data
  always carries the "virtual users" banner. `abkit readout PATH` prints the memo of a
  golden case directory, or of a CSV with `--params params.json` and `--simulated` /
  `--real`; the Streamlit app (`[app]` extra) shows the same memo.
- `abkit.labeling` (PR 15b, G-decide): `abkit decide export` writes 30 blinded
  readouts (28 G-sim cases drawn per group with a fixed seed, plus 2 real Hillstrom
  readouts) to `analytics/golden/decide/v1/`, with abkit's decision and the case name
  hidden and every effect shown, also when SRM fails. `abkit decide label` shows them one
  at a time and saves Lam's ship / no ship / investigate to `labels.csv`, resuming where
  it stopped. `abkit decide kappa` reports Cohen's kappa of those labels against the memo
  (SRM-blocked = investigate) and against a "p < 0.05 only" baseline; `--record` appends
  the two M11 rows. M11 waits for gate G-B2-3 (Lam's labels).
- `abkit.actions` (PR 18, data for the DiD of PR 19, question G-B2-1): does PR merge time
  change when a repository starts using GitHub Actions? `abkit actions-panel --cache DIR`
  reads public data through `gh api`, GET only, with every answer cached under `DIR` (keep
  it outside git, e.g. `D:/data/b2/gh-cache`; a rerun resumes from it and a rate limit
  waits for its reset). Frame: non-fork repositories with 100–2000 stars, the first 300
  search results per creation month 2014-01..2017-12; 400 of them drawn with seed 18.
  Adoption is the oldest default-branch commit touching `.github/workflows`. The compact
  panel in `analytics/data/actions_panel/` has one row per repo and month 2018-01..2022-12:
  merged non-bot PRs created that month, median and mean `log1p` hours to merge, months
  since adoption and `treated`; `repos.csv` lists every sampled repo (also the missing ones)
  and `meta.json` the seed, queries and counts. Search ranks by stars inside the band, so
  the frame leans to the upper end of it.
- `abkit.did` (PR 19, M7): staggered DiD on that panel. `sun_abraham` is the Sun &
  Abraham (2021) interaction-weighted event study (one dummy per adoption cohort and event
  time, reference -1, never-adopters and repos adopting after 2022 as controls, cohorts
  averaged by their share of treated rows, repo-clustered CR1 errors) with a joint Wald
  pre-trend test; `twfe_event_study` and `twfe_static` are the TWFE baselines that staggered
  timing biases. `python -m abkit.did.m7 --pr 19` runs 8 specs fixed in advance and appends
  them to `runs.csv`. Main spec (quarters, 4 either side, outcome mean `log1p` hours to
  merge): ATT -0.194 (95% CI -0.685 to 0.298, p = 0.44), about -17.6%, with pre-trend
  p = 0.43 and a placebo adoption 4 quarters early at p = 0.26: no detectable change in
  merge time. Weighting rows by merged PRs gives -0.337 (CI -0.648 to -0.026, p = 0.034).
  The monthly specs fail the pre-trend test (p = 9.8e-07 for the mean, 0.00099 for the
  median), so monthly event times are not read as causal.
- `abkit.runs`: the `analytics/runs/runs.csv` ledger. Every number quoted in a
  README must come from a row in that file.
- `abkit.bench`: runs a named benchmark and appends its result to `runs.csv`.
- `abkit golden`: runs abkit on every case of a golden dataset (default
  `analytics/golden/v2`) and prints pass/fail by each case's tolerance. Format,
  methods and freezing: `analytics/golden/README.md`.
- `abkit.criteo`: the Criteo Uplift v2.1 file (CC BY-NC-SA, kept under
  `D:/data/b2/criteo/`, never committed), read in chunks with its sha256
  checked, arm totals, and a seeded row sample saved as `.npz`.
- `abkit.uplift` (M8): T-learner and X-learner over NumPy L2 logistic / ridge
  base learners, the budget LP solved by CBC through PuLP (the `[uplift]` extra;
  `[dev]` includes it) against top-k by predicted uplift, and the inverse
  propensity value of a targeting policy on randomized data. A user's cost is
  the predicted chance their ad is shown, `P(exposure | x)`, because Criteo has
  no price and an ad is paid when shown. The LP and top-k get the same budget.
  On the 10% sample, 5 seeds (`runs.csv`, PR 20), the LP beats top-k with the
  T-learner (+5.3%, +9.3%, +3.7% extra conversions at 10/20/30% budgets) and
  loses with the X-learner (-12.0%, -10.0%, -15.9%). The inverse propensity
  spend shows why: with the X-learner the LP picks users whose exposure the cost
  model underestimates, and it spends about 1.2x the budget.
- `abkit.forecast` (M9): daily DAU and contributor series from an event log
  (simkit `events.jsonl` or a directory of daily `*.jsonl.gz` exports), seasonal
  naive (baseline), ETS and ARIMA with 95% prediction intervals, and a
  rolling-origin backtest that refits on the past only at every origin. A
  contributor is a user who requested, edited or saved a trip that day. ETS
  (additive error; trend none/additive/damped; season none/additive) and ARIMA
  (`d` by KPSS, `p+q <= 2`, seasonal AR `P <= 1`) choose a candidate by AICc.
  ETS and ARIMA need the `[forecast]` extra (`statsmodels`); `[dev]` includes it.
- `r/` (optional): an R `testthat` suite that recomputes every G-ref Welch,
  CUPED and delta case with base R (`t.test`, `cov`, `pnorm`) and requires
  `|R - golden| <= 1e-8` on every expected key. Needs R with `testthat` and
  `jsonlite`; run `Rscript analytics/abkit/r/run.R`. `tests/test_r_crosscheck.py`
  runs it when `Rscript` is found (`ABKIT_RSCRIPT`, `PATH`, or
  `C:/Program Files/R`) and skips otherwise, so CI (no R) skips it; it also
  skips when `testthat` or `jsonlite` is missing. `test-mutations.R` proves the
  suite goes red on broken R code (pooled t-test, swapped groups, CUPED with
  `theta` from control only or `theta = 0`, delta without the covariance term
  or with a fixed alpha) and on golden answers shifted by 1e-7.

```bash
python -m venv analytics/.venv
analytics/.venv/Scripts/python -m pip install -e "analytics/abkit[dev]"   # bin/ on Linux/macOS
cd analytics/abkit && ../.venv/Scripts/python -m ruff check . && ../.venv/Scripts/python -m ruff format --check . && ../.venv/Scripts/python -m pytest -q
analytics/.venv/Scripts/python -m abkit.bench assignment --pr 9
analytics/.venv/Scripts/python -m abkit.uplift --raw D:/data/b2/criteo/criteo-research-uplift-v2.1.csv.gz --save-sample D:/data/b2/criteo/criteo-uplift-v2.1-10pct-seed20.npz --pr 20   # M8, 5 seeds; later runs: --sample <npz>; --dry-run
analytics/.venv/Scripts/python -m abkit.peeking --pr 12   # 10,000 A/A x 14 days; --dry-run to print only
analytics/.venv/Scripts/python -m abkit golden   # latest golden version; --strict: MISSING fails too; --subset ci-fast
analytics/.venv/Scripts/python -m abkit gate     # 10 planted mutants vs ci-fast (M10); --full; --record --pr 15a
analytics/.venv/Scripts/python -m abkit readout analytics/golden/v2/sim-srm/loss-15-aa   # memo; --out memo.md
analytics/.venv/Scripts/python -m abkit decide label            # G-B2-3: label the 30 blinded readouts
analytics/.venv/Scripts/python -m abkit decide kappa --record   # M11 after every readout has a label
analytics/.venv/Scripts/python -m pip install -e "analytics/abkit[app]"   # Streamlit; CI skips the app tests
analytics/.venv/Scripts/python -m streamlit run analytics/abkit/src/abkit/readout/app.py
analytics/.venv/Scripts/python -m abkit.cuped_check D:/data/b2/hillstrom.csv --pr 11   # M4
analytics/.venv/Scripts/python -m simkit.generate --seed 42 --users 1000 --days 112 --out analytics/data/simulated/m9
analytics/.venv/Scripts/python -m abkit.forecast analytics/data/simulated/m9/events.jsonl     --simulated --pr 21 --seed 42 --initial 56 --step 1 --horizon 7   # appends M9 rows; --dry-run
```

`abkit.forecast` makes you say `--simulated` or `--real` (no default) and refuses
`--real` when a user id carries simkit's `sim-` prefix. simkit has no weekly
cycle and its users never churn, so on its events the series is a ramp plus
noise: ETS and ARIMA win there by following the trend, which says little about
weekly seasonality on real traffic.
