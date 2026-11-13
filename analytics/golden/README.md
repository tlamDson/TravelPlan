# Golden datasets for `abkit`

Every case has a known answer that **abkit did not compute**, so the engine can
never vouch for itself (B2 plan, "Golden dataset").

```bash
analytics/.venv/Scripts/python -m abkit golden                       # latest (v2); exit 1 on FAIL/ERROR
analytics/.venv/Scripts/python -m abkit golden analytics/golden/v2 --strict   # MISSING fails too
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

| Method                    | Data columns                                             | Params                                                               | Outputs                                                                                                                                                                                                                   | Decision         |
| ------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `welch_ttest`             | `variant`, `value`                                       | `alpha`, `alternative`                                               | `estimate`, `statistic`, `df`, `p_value`, `ci_low`, `ci_high` (CI two-sided only)                                                                                                                                         | yes              |
| `delta_ratio`             | `variant`, `numerator`, `denominator` (one row per user) | `alpha`                                                              | `ratio_control`, `ratio_treatment`, `estimate`, `se`, `statistic`, `p_value`, `ci_low`, `ci_high`                                                                                                                         | yes              |
| `cuped`                   | `variant`, `value`, `covariate`                          | `alpha`, `alternative`                                               | `theta`, `variance_reduction`, then the Welch outputs on the adjusted values; also `sample_size_multiplier` (`1/(1-R²)`), `n_control`, `n_treatment`, raw `mean_control` / `mean_treatment`, `naive_estimate`, `naive_se` | yes              |
| `srm_chisquare`           | `variant`, `count`, `expected_share`                     | `threshold`                                                          | `statistic`, `p_value`, `dof`                                                                                                                                                                                             | `srm` / `no_srm` |
| `power_ttest_ind`         | —                                                        | `effect_size`, `nobs1`, `ratio`, `alpha`, `alternative`              | `power`                                                                                                                                                                                                                   | —                |
| `sample_size_ttest_ind`   | —                                                        | `effect_size`, `power`, `ratio`, `alpha`, `alternative`              | `nobs1` (not rounded up)                                                                                                                                                                                                  | —                |
| `mde_ttest_ind`           | —                                                        | `nobs1`, `power`, `ratio`, `alpha`, `alternative`                    | `effect_size` (Cohen's d)                                                                                                                                                                                                 | —                |
| `sample_size_proportions` | —                                                        | `p_control`, `p_treatment`, `power`, `ratio`, `alpha`, `alternative` | `effect_size` (Cohen's h), `nobs1`                                                                                                                                                                                        | —                |
| `bh_fdr`                  | `hypothesis`, `p_value`                                  | `alpha`                                                              | `p_adjusted`, `rejected` (input row order)                                                                                                                                                                                | —                |

The exact formula behind each case is in its `source.call`.

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
