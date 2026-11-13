# Golden datasets for `abkit`

Every case has a known answer that **abkit did not compute**, so the engine can
never vouch for itself (B2 plan, "Golden dataset").

```bash
analytics/.venv/Scripts/python -m abkit golden                       # latest (v2); exit 1 on FAIL/ERROR
analytics/.venv/Scripts/python -m abkit golden analytics/golden/v2 --strict   # MISSING fails too
analytics/.venv/Scripts/python -m abkit golden --subset ci-fast             # CI gate subset
```

Statuses: `PASS` (every expected key within tolerance, decision equal),
`FAIL` (a value or the decision is off; the report prints both numbers),
`MISSING` (no abkit implementation registered for the method yet, see
`abkit/golden/methods.py`), `ERROR` (the implementation raised). Exit code 2
means the dataset itself is malformed.

## Layout and versioning

`v<N>/<group>/<case>/` holds `truth.json` and, unless the case is purely
parametric, `data.csv`. Group and case names are kebab-case. A frozen case is
never edited: a changed case goes into a new version (`v2/`) and `v1/` stays
for comparison.

## `truth.json`

| Key              | Meaning                                                                     |
| ---------------- | --------------------------------------------------------------------------- |
| `schema_version` | `1`                                                                         |
| `id`             | `<group>/<case>`, equal to the directory path                               |
| `method`         | One of the methods below                                                    |
| `description`    | What the case holds, in one sentence                                        |
| `data`           | `"data.csv"` or `null`                                                      |
| `params`         | Inputs passed to the method besides the data                                |
| `expected`       | Output key → finite number, bool, or non-empty list of one kind             |
| `decision`       | Expected decision string, or `null` when the method makes none              |
| `tolerance`      | `default` plus optional per-key `{abs, rel}`; passes when `                 | actual − expected | ≤ abs + rel· | expected | `   |
| `source`         | `tool`, `version`, `call` (required), plus `generator`, `frozen_at`, `seed` |

Unknown keys are rejected. An implementation may return extra output keys;
they are ignored.

## Methods (the contract abkit implements)

An implementation is `fn(data, params) -> dict`, where `data` maps each CSV
column to a NumPy array (float64 when every cell is numeric, else str) or is
`None`. `variant` is `control` / `treatment`; estimates are treatment minus
control. Decisions: `reject_null` when `p_value < alpha`, else `fail_to_reject`.

| Method                    | Data columns                                                      | Params                                                               | Outputs                                                                                                                                                                                                                   | Decision         |
| ------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `welch_ttest`             | `variant`, `value`                                                | `alpha`, `alternative`                                               | `estimate`, `statistic`, `df`, `p_value`, `ci_low`, `ci_high` (CI two-sided only)                                                                                                                                         | yes              |
| `delta_ratio`             | `variant`, `numerator`, `denominator` (one row per user)          | `alpha`                                                              | `ratio_control`, `ratio_treatment`, `estimate`, `se`, `statistic`, `p_value`, `ci_low`, `ci_high`                                                                                                                         | yes              |
| `cuped`                   | `variant`, `value`, `covariate`                                   | `alpha`, `alternative`                                               | `theta`, `variance_reduction`, then the Welch outputs on the adjusted values; also `sample_size_multiplier` (`1/(1-R²)`), `n_control`, `n_treatment`, raw `mean_control` / `mean_treatment`, `naive_estimate`, `naive_se` | yes              |
| `srm_chisquare`           | `variant`, `count`, `expected_share`                              | `threshold`                                                          | `statistic`, `p_value`, `dof`                                                                                                                                                                                             | `srm` / `no_srm` |
| `power_ttest_ind`         | —                                                                 | `effect_size`, `nobs1`, `ratio`, `alpha`, `alternative`              | `power`                                                                                                                                                                                                                   | —                |
| `sample_size_ttest_ind`   | —                                                                 | `effect_size`, `power`, `ratio`, `alpha`, `alternative`              | `nobs1` (not rounded up)                                                                                                                                                                                                  | —                |
| `mde_ttest_ind`           | —                                                                 | `nobs1`, `power`, `ratio`, `alpha`, `alternative`                    | `effect_size` (Cohen's d)                                                                                                                                                                                                 | —                |
| `sample_size_proportions` | —                                                                 | `p_control`, `p_treatment`, `power`, `ratio`, `alpha`, `alternative` | `effect_size` (Cohen's h), `nobs1`                                                                                                                                                                                        | —                |
| `bh_fdr`                  | `hypothesis`, `p_value`                                           | `alpha`                                                              | `p_adjusted`, `rejected` (input row order)                                                                                                                                                                                | —                |
| `readout`                 | `variant`, `persona`, metric columns (see below)                  | see below                                                            | `srm`, `estimate`, plus `early_estimate` / `estimate_<persona>`                                                                                                                                                           | see below        |
| `naive_diff`              | `treatment` (0/1), the `outcome` column                           | `outcome`, `alpha`, `se_type` (`welch` / `pooled`)                   | `estimate`, `se`, `statistic`, `p_value`, `ci_low`, `ci_high`                                                                                                                                                             | yes              |
| `ipw`                     | `treatment`, `outcome`, covariates                                | `outcome`, `estimand` (`ate` / `att`), `propensity_terms`, `alpha`   | as `naive_diff` (normal-based)                                                                                                                                                                                            | yes              |
| `aipw`                    | `treatment`, `outcome`, covariates                                | as `ipw`, plus `outcome_terms`                                       | as `naive_diff` (normal-based)                                                                                                                                                                                            | yes              |
| `uplift_arm_summary`      | `variant`, `n`, `visit`, `conversion` (one row of totals per arm) | —                                                                    | `n_total`, `treatment_ratio`, `visit_rate`, `conversion_rate`, `ate_*`, `relative_uplift_*`                                                                                                                               | —                |

The exact formula behind each case is in its `source.call`. The causal methods take
covariates as terms: `age`, `age^2`, `u74*black` (an intercept is always added); the
formulas are in `abkit/causal/estimators.py`.

### `readout` (G-sim)

One row per enrolled user (observed arm only). `params`:

- `alpha` (0.05), `srm_threshold` (0.0005), `expected_shares` (`{control, treatment}`).
- `metric`: `{"kind": "mean", "column": c}` (difference of per-user means) or
  `{"kind": "ratio", "numerator": n, "denominator": d}` (difference of
  `sum(n) / sum(d)` per arm, delta method).
- `early_metric` (novelty cases): the first half of each user's window. Report
  its effect as `early_estimate`, but **decide on `metric`** (the late half).
- `by_persona: true`: also report `estimate_<persona>` for `browser`,
  `planner`, `power`.
- `looks` + `window_days` (peeking cases): interim days someone already peeked
  at. A look at day `d` sees users with `exposure_day < d - window_days`. Looks
  must not change the decision: decide once, at the planned horizon (all rows),
  or with a test that stays valid under continuous monitoring.

Decision: `invalid` when the chi-square SRM test on row counts per variant has
`p < srm_threshold` (output `srm: true`, nothing else is compared); otherwise
`ship` when the primary metric's `p < alpha` and `estimate > 0`, else
`no_ship`. `estimate` keys are compared to the **true** effect, so their
tolerance is wide (see G-sim).

## Subsets

`v<N>/subsets.json` names subsets of a dataset:
`{"<name>": {"description": "...", "entries": [...]}}`. An entry is a whole
group (`welch`) or one case id (`sim-aa/aa-01`), and must match at least one
case. `ci-fast` is the required CI gate: every G-ref case plus one G-sim case
per group. The full dataset runs nightly (B2 plan, PR 15a).

## G-ref (`v2` latest, 22 cases; `v1` kept)

Frozen by `abkit.golden.freeze_ref` from the seeded table in
`abkit/golden/ref_cases.py`; the numbers come from `abkit/golden/ref_truth.py`,
which uses only NumPy, scipy and statsmodels and imports nothing from abkit.
Closed-form cases have tolerance `abs 1e-10, rel 1e-9`; root-solved power
cases `rel 1e-6`. R cross-checks these again in PR 23.

```bash
analytics/.venv/Scripts/python -m pip install -e "analytics/abkit[dev,golden]"   # adds statsmodels
analytics/.venv/Scripts/python -m abkit.golden.freeze_ref analytics/golden/v3    # refuses to overwrite without --force
```

### v2 (B2 plan, PR 10)

`v2` re-froze three power cases. All other cases are byte-identical to `v1`,
and `tests/test_golden_reference.py` checks that.

- `power/ttest-mde` and `power/ttest-sample-size`: the truth is now a tight
  `scipy.optimize.brentq` root of statsmodels' `TTestIndPower().power`.
  `solve_power` stops at its `xtol=1e-5`, so v1's MDE was outside its own
  `rel 1e-6` tolerance, and its power was below the 0.8 target.
- `power/ttest-power`: the tolerance is now `rel 1e-7`. statsmodels computes
  the noncentral t with cdflib `nctdtr`, which is about 1e-8 away from scipy's
  boost `nct` and from quadrature. v1's `rel 1e-9` was stricter than its own
  reference.

`abkit golden analytics/golden/v1` still fails those two cases on purpose
(`tests/test_golden_core_stats.py` pins this).

`tests/test_golden_reference.py` regenerates the data and recomputes the truth
of every committed case; the statsmodels cases skip where the `[golden]` extra
is not installed (CI installs core + dev only).

## G-public (`v2/hillstrom/`, B2 plan, PR 11)

Published numbers, never computed by abkit. Each was checked against the raw
file before it was used, and `truth.json` links its source (`source.url`) and
the exact data file (`source.data_url`, `source.data_sha256`).

| Case                   | Data (Mens E-Mail vs No E-Mail)        | Truth                                                                                       |
| ---------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------- |
| `hillstrom/mens-visit` | `value` = visit, `covariate` = recency | Radcliffe (2008) Table 2: visit 18.28% vs 10.62%, uplift 7.66 pp; Table 1: 21,307 vs 21,306 |
| `hillstrom/mens-spend` | `value` = spend, `covariate` = history | Table 2: control $0.65 per head, uplift $0.77; same arm sizes                               |

Not used: the treated spend per head printed in Table 2 ($1.41) does not match
the file ($1.4226). Radcliffe reports no test, so `decision` is `null`.
Tolerances: counts exact; a printed number within half its last printed unit;
the CUPED `estimate` also gets 3 sd of the shift CUPED makes (`theta` times the
arm imbalance in the covariate, about `R * SE`).

Adding a new group to `v2` does not touch a frozen case, so it does not need a
new version. The raw file is not committed (B2 plan: external data under
`D:\data\b2\`); `data.csv` holds only the two arms and three columns.

```bash
curl -o D:/data/b2/hillstrom.csv http://www.minethatdata.com/Kevin_Hillstrom_MineThatData_E-MailAnalytics_DataMiningChallenge_2008.03.20.csv
analytics/.venv/Scripts/python -m abkit.golden.freeze_public D:/data/b2/hillstrom.csv analytics/golden/v3   # checks the sha256
```

`tests/test_golden_public.py` refreezes into a temp dir and compares bytes
when the raw file is at `D:/data/b2/hillstrom.csv` (or `ABKIT_HILLSTROM_CSV`);
it skips otherwise, as on CI.

## G-sim (`v2`, 50 cases, simulated)

SIMULATED experiments (virtual users, `simkit`), 50/50 on `trip_saved`:
`sim-aa` ×10, `sim-effect` ×15 (some lifts only for some personas, some
harmful), `sim-srm` ×5 (a share of treatment exposures never logged),
`sim-novelty` ×5 (a boost that halves every day, with or without a lasting
lift), `sim-ratio` ×5 (saves per trip view), `sim-peeking` ×5 (A/A where a
naive interim look would ship), `sim-long-tail` ×5 (lognormal booking value).

- **Decision** comes from the planted parameters only
  (`simkit/golden_cases.py`): exposure loss → `invalid`; a lasting lift > 0 →
  `ship`; < 0 or none → `no_ship`.
- **Estimates** are the true effect in the sample: `simkit.golden_truth` runs
  the same simulated users in both arms (each user has their own RNG stream and
  behaves identically until first exposure) and averages
  `Y(treatment) − Y(control)`. Tolerance is 4 standard errors of the observed
  difference, since a correct readout sees only one arm per user.
- **Screening:** one seeded draw can disagree with its planted decision by
  chance. The freezer tries seeds from `first_seed` until an independent scipy
  readout (`simkit/golden_reference.py`) agrees with the planted decision,
  every estimate is within tolerance, and the trap is present (novelty: the
  early window would ship; peeking: an interim look would ship).
  `source.screening` records the attempts, so the selection is visible.

```bash
analytics/.venv/Scripts/python -m pip install -e "analytics/simkit[dev]"   # after abkit
analytics/.venv/Scripts/python -m simkit.freeze_golden analytics/golden/v3   # refuses to overwrite without --force
```

`simkit/tests/test_golden_sim.py` re-screens every committed case from its
`data.csv` and rebuilds the `ci-fast` ones byte for byte from their seed;
`SIMKIT_GOLDEN_FULL=1` rebuilds all 50 (minutes, nightly).

## G-public: LaLonde NSW (`v2/public/`, B2 plan, PR 17)

Truth is the published numbers of Dehejia & Wahba (1999), [NBER WP 6586](https://www.nber.org/papers/w6586)
(JASA 94(448)), never abkit. Data: their NSW RE74 subsample and PSID-1 comparison group,
[users.nber.org/~rdehejia/data](https://users.nber.org/~rdehejia/data/.nswdata2.html); the
sha256 of each raw file is pinned in `abkit/golden/freeze_lalonde.py` and in `source.data_files`.

| Case                   | Method       | Expected (published)                         | Tolerance                                   |
| ---------------------- | ------------ | -------------------------------------------- | ------------------------------------------- |
| `lalonde-experimental` | `naive_diff` | estimate 1,794, SE 633 (Table 2B/3, row NSW) | ±0.5 (rounding)                             |
| `lalonde-psid-naive`   | `naive_diff` | estimate −15,205, SE 1,154/1,155 (Table 2/3) | ±0.5; SE ±1                                 |
| `lalonde-psid-ipw`     | `ipw` (ATT)  | the experimental 1,794                       | ±1,240.66 = 1.96 × 633, the experimental CI |
| `lalonde-psid-aipw`    | `aipw` (ATT) | the experimental 1,794                       | same                                        |

The two observational cases pass when the estimate on NSW treated + PSID-1 controls lands
inside the experimental 95% CI. The propensity model is DW's PSID-1 logit (Table 3, note c);
the AIPW outcome model uses DW's regression covariates (Table 3, note a). The raw files stay
outside the repo (`D:/data/b2/lalonde`); `tests/test_golden_causal.py` checks the committed
data against them when present, and with NumPy alone that it reproduces 1,794, 633 and −15,205.

```bash
analytics/.venv/Scripts/python -m abkit.golden.freeze_lalonde D:/data/b2/lalonde   # --force to rewrite
```

## G-public Criteo (`v2/criteo/`, B2 plan, PR 20)

`criteo/v21-key-figures` holds the key figures that the
[Criteo AI Lab page](https://ailab.criteo.com/criteo-uplift-prediction-dataset/)
prints for the un-biased Criteo Uplift file (v2.1): 13,979,592 rows, visit rate
.046992, conversion rate .00292 and treatment ratio .85. Each tolerance is half a
unit of the last printed digit. Table 1 of
[Diemert et al. (2021)](https://arxiv.org/abs/2111.10106) prints the same figures
(4.70% / 0.29%). We checked every figure against the raw file before freezing.
Table 1 also prints a "Relative Avg. Uplift" of 68.7% (visit) and 37.2%
(conversion). The file gives 27.1% and 59.4% as (treated − control) / control,
so the case does not use them.

The dataset is CC BY-NC-SA and is not republished here, so `data.csv` has only
the two arm totals. To re-freeze from the raw file (the sha256 is checked; the
file is Criteo's own copy on Hugging Face, `abkit.criteo.CRITEO_MIRROR_URL`):

```bash
analytics/.venv/Scripts/python -m abkit.golden.freeze_criteo D:/data/b2/criteo/criteo-research-uplift-v2.1.csv.gz --root analytics/golden/v3
```

## G-decide (`decide/v1/`, 30 blinded readouts, B2 plan, PR 15b)

The answer here is Lam's own call, not abkit's: gate G-B2-3, about 1–2 hours.

| File                         | What                                                                                                                                                                                                                                                                 |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `readouts/R01.md` … `R30.md` | The evidence of a readout without its conclusion: who the users are, the sample ratio numbers, every effect (also when SRM fails), the early window, persona table and interim looks where the case has them. No decision, no PASS/FAIL, no case name or description |
| `key.json`                   | Blind id → case, `simulated`, abkit's `memo` label (SRM-blocked = `investigate`), and the `baseline` label (ship when `p < alpha` and the lift is positive, ignoring SRM). **Do not open it before labelling**                                                       |
| `labels.csv`                 | Lam's labels (`readout,label,labelled_at`), written by `abkit decide label`; not committed until G-B2-3 is done                                                                                                                                                      |

28 readouts are G-sim cases drawn per group with seed 1115 (A/A 5, effect 8, long tail 3,
novelty 3, peeking 3, ratio 3, SRM 3), all simulated (virtual users); 2 are the real
Hillstrom e-mail test (`hillstrom/mens-visit`, `hillstrom/mens-spend`, real shoppers,
not TravelPlan users). `tests/test_labeling_export.py` re-exports and byte-compares
this directory, so it is never edited by hand: `abkit decide export --force` rewrites it
and refuses while a `labels.csv` exists.

```bash
analytics/.venv/Scripts/python -m abkit decide label            # s / n / i, q to stop; resumes
analytics/.venv/Scripts/python -m abkit decide kappa            # kappa vs memo and vs p-only
analytics/.venv/Scripts/python -m abkit decide kappa --record   # append the two M11 rows
```
