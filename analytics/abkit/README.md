# abkit

Experimentation toolkit for TravelPlan (B2 plan). This first version has:

- `abkit.assignment`: deterministic variant assignment. It matches the server
  (`backend/src/features/experiments/services/assignment.ts`) on all rows of
  `packages/shared/fixtures/assignment-vectors.json`.
- `abkit.stats`: Welch's t-test, the delta method for ratio metrics, the SRM
  chi-square check (threshold `p < 0.0005`), and power / sample size / MDE for
  the two-sample t-test and two proportions (Cohen's h). Estimates are
  treatment minus control. Bad input raises `ValueError`, so a function never
  returns NaN. These must pass the golden G-ref cases of each method.
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
- `abkit.runs`: the `analytics/runs/runs.csv` ledger. Every number quoted in a
  README must come from a row in that file.
- `abkit.bench`: runs a named benchmark and appends its result to `runs.csv`.
- `abkit golden`: runs abkit on every case of a golden dataset (default
  `analytics/golden/v2`) and prints pass/fail by each case's tolerance. Format,
  methods and freezing: `analytics/golden/README.md`.
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
analytics/.venv/Scripts/python -m abkit golden   # latest golden version; --strict: MISSING fails too; --subset ci-fast
analytics/.venv/Scripts/python -m abkit.cuped_check D:/data/b2/hillstrom.csv --pr 11   # M4
analytics/.venv/Scripts/python -m simkit.generate --seed 42 --users 1000 --days 112 --out analytics/data/simulated/m9
analytics/.venv/Scripts/python -m abkit.forecast analytics/data/simulated/m9/events.jsonl     --simulated --pr 21 --seed 42 --initial 56 --step 1 --horizon 7   # appends M9 rows; --dry-run
```

`abkit.forecast` makes you say `--simulated` or `--real` (no default) and refuses
`--real` when a user id carries simkit's `sim-` prefix. simkit has no weekly
cycle and its users never churn, so on its events the series is a ramp plus
noise: ETS and ARIMA win there by following the trend, which says little about
weekly seasonality on real traffic.
