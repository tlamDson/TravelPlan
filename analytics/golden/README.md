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

| Method                    | Data columns                                             | Params                                                               | Outputs                                                                                           | Decision         |
| ------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------- |
| `welch_ttest`             | `variant`, `value`                                       | `alpha`, `alternative`                                               | `estimate`, `statistic`, `df`, `p_value`, `ci_low`, `ci_high` (CI two-sided only)                 | yes              |
| `delta_ratio`             | `variant`, `numerator`, `denominator` (one row per user) | `alpha`                                                              | `ratio_control`, `ratio_treatment`, `estimate`, `se`, `statistic`, `p_value`, `ci_low`, `ci_high` | yes              |
| `cuped`                   | `variant`, `value`, `covariate`                          | `alpha`, `alternative`                                               | `theta`, `variance_reduction`, then the Welch outputs on the adjusted values                      | yes              |
| `srm_chisquare`           | `variant`, `count`, `expected_share`                     | `threshold`                                                          | `statistic`, `p_value`, `dof`                                                                     | `srm` / `no_srm` |
| `power_ttest_ind`         | —                                                        | `effect_size`, `nobs1`, `ratio`, `alpha`, `alternative`              | `power`                                                                                           | —                |
| `sample_size_ttest_ind`   | —                                                        | `effect_size`, `power`, `ratio`, `alpha`, `alternative`              | `nobs1` (not rounded up)                                                                          | —                |
| `mde_ttest_ind`           | —                                                        | `nobs1`, `power`, `ratio`, `alpha`, `alternative`                    | `effect_size` (Cohen's d)                                                                         | —                |
| `sample_size_proportions` | —                                                        | `p_control`, `p_treatment`, `power`, `ratio`, `alpha`, `alternative` | `effect_size` (Cohen's h), `nobs1`                                                                | —                |
| `bh_fdr`                  | `hypothesis`, `p_value`                                  | `alpha`                                                              | `p_adjusted`, `rejected` (input row order)                                                        | —                |
| `naive_diff`              | `treatment` (0/1), the `outcome` column                  | `outcome`, `alpha`, `se_type` (`welch` / `pooled`)                   | `estimate`, `se`, `statistic`, `p_value`, `ci_low`, `ci_high`                                     | yes              |
| `ipw`                     | `treatment`, `outcome`, covariates                       | `outcome`, `estimand` (`ate` / `att`), `propensity_terms`, `alpha`   | as `naive_diff` (normal-based)                                                                    | yes              |
| `aipw`                    | `treatment`, `outcome`, covariates                       | as `ipw`, plus `outcome_terms`                                       | as `naive_diff` (normal-based)                                                                    | yes              |

The exact formula behind each case is in its `source.call`. The causal methods take
covariates as terms: `age`, `age^2`, `u74*black` (an intercept is always added); the
formulas are in `abkit/causal/estimators.py`.

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

## G-public: LaLonde NSW (`v2/public/`, B2 plan, PR 17)

Truth is the published numbers of Dehejia & Wahba (1999), [NBER WP 6586](https://www.nber.org/papers/w6586)
(JASA 94(448)), never abkit. Data: their NSW RE74 subsample and PSID-1 comparison group,
[users.nber.org/~rdehejia/data](https://users.nber.org/~rdehejia/data/.nswdata2.html); the
sha256 of each raw file is pinned in `abkit/golden/freeze_public.py` and in `source.data_files`.

| Case                          | Method       | Expected (published)                         | Tolerance                                   |
| ----------------------------- | ------------ | -------------------------------------------- | ------------------------------------------- |
| `lalonde-experimental`        | `naive_diff` | estimate 1,794, SE 633 (Table 2B/3, row NSW) | ±0.5 (rounding)                             |
| `lalonde-psid-naive`          | `naive_diff` | estimate −15,205, SE 1,154/1,155 (Table 2/3) | ±0.5; SE ±1                                 |
| `lalonde-psid-ipw`            | `ipw` (ATT)  | the experimental 1,794                       | ±1,240.66 = 1.96 × 633, the experimental CI |
| `lalonde-psid-aipw`           | `aipw` (ATT) | the experimental 1,794                       | same                                        |

The two observational cases pass when the estimate on NSW treated + PSID-1 controls lands
inside the experimental 95% CI. The propensity model is DW's PSID-1 logit (Table 3, note c);
the AIPW outcome model uses DW's regression covariates (Table 3, note a). The raw files stay
outside the repo (`D:/data/b2/lalonde`); `tests/test_golden_causal.py` checks the committed
data against them when present, and with NumPy alone that it reproduces 1,794, 633 and −15,205.

```bash
analytics/.venv/Scripts/python -m abkit.golden.freeze_public D:/data/b2/lalonde   # --force to rewrite
```
