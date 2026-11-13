# B2 resume bullets (abkit)

Every number below is a `runs.csv` row, listed in the source table (a test checks the table
against `analytics/runs/runs.csv`). Users in the first two bullets are simulated (virtual
users) and counted apart from real users; those results are "recovered a known injected
effect", not an effect on real people. Reruns replace numbers: regenerate this page's table
from `runs.csv`, then reword.

- Built `abkit`, an A/B testing platform (deterministic assignment, Welch and delta-method
  tests, CUPED, mSPRT sequential testing, SRM checks, golden-dataset CI gate); on 10,000
  simulated A/A tests, mSPRT held the daily-peeking false positive rate at 0.17% vs 21.6% for
  a t-test read every day, and on 50,000 simulated users it recovered the injected effect
  with 0.02 pp bias and 95.7% interval coverage over 1,000 simulated experiments. A planted-bug
  gate in CI blocked 10 of 10 mutants.
- Applied causal inference to public data: doubly robust (AIPW) estimation cut ATE bias on
  biased Hillstrom RCT resamples from 3.7 pp (naive) to -0.015 pp (100 resamples); a staggered
  difference-in-differences (Sun & Abraham) on 292 GitHub repos found no detectable effect of
  adopting GitHub Actions on PR merge time (-17.6%, 95% CI -0.69 to 0.30 log1p hours, pre-trend
  p = 0.43).
- Allocated a fixed budget with a T-learner and linear programming on a 10% Criteo sample
  (418,831 test users, 5 seeds), +5.3% incremental conversions over top-k at equal budget (the
  X-learner lost 12.0%; per-seed results varied, one seed was negative); a seasonal-naive
  baseline gave 8.9% MAPE on simulated daily active users vs 3.4% for ARIMA, whose 95% interval
  covered only 82.9% (below nominal).

Left out on purpose: CUPED barely helped on Hillstrom (0.64% variance reduction, so about 0.6%
smaller samples), so it is not a headline number; the monthly DiD specification failed its
pre-trend test (p = 1e-6), the main specification did not.

## Source

| Metric                                     | Value     | Unit        | n       |
| ------------------------------------------ | --------- | ----------- | ------- |
| `fpr_msprt_daily_peek`                     | 0.0017    | proportion  | 10,000  |
| `fpr_ttest_daily_peek`                     | 0.2155    | proportion  | 10,000  |
| `bias_ate_pp_n50000`                       | 0.01852   | pp          | 1,000   |
| `ci95_coverage_ate_n50000`                 | 0.957     | proportion  | 1,000   |
| `golden_gate_mutants_blocked`              | 10        | mutants     | 10      |
| `hillstrom_ate_bias_naive_diff`            | 3.711     | pp          | 100     |
| `hillstrom_ate_bias_aipw`                  | -0.01504  | pp          | 100     |
| `did_att_pct_main`                         | -17.6     | %           | 292     |
| `did_att_ci95_low_main`                    | -0.6852   | log1p hours | 292     |
| `did_att_ci95_high_main`                   | 0.298     | log1p hours | 292     |
| `did_pretrend_p_main`                      | 0.4345    | p           | 292     |
| `did_pretrend_p_monthly`                   | 9.846e-07 | p           | 283     |
| `hillstrom_visit_cuped_variance_reduction` | 0.006414  | fraction    | 42,613  |
| `m8_lp_gain_over_topk_t_b10`               | 5.3       | %           | 418,831 |
| `m8_lp_gain_over_topk_x_b10`               | -12.02    | %           | 418,831 |
| `forecast_mape_dau_seasonal_naive`         | 8.942     | %           | 350     |
| `forecast_mape_dau_arima`                  | 3.439     | %           | 350     |
| `forecast_pi95_coverage_dau_arima`         | 0.8286    | share       | 350     |
