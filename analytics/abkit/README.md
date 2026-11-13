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
