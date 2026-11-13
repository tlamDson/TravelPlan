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

```bash
python -m venv analytics/.venv
analytics/.venv/Scripts/python -m pip install -e "analytics/abkit[dev]"   # bin/ on Linux/macOS
cd analytics/abkit && ../.venv/Scripts/python -m ruff check . && ../.venv/Scripts/python -m ruff format --check . && ../.venv/Scripts/python -m pytest -q
analytics/.venv/Scripts/python -m abkit.bench assignment --pr 9
analytics/.venv/Scripts/python -m abkit golden   # latest golden version; --strict: MISSING fails too
analytics/.venv/Scripts/python -m abkit.uplift --raw D:/data/b2/criteo/criteo-research-uplift-v2.1.csv.gz --save-sample D:/data/b2/criteo/criteo-uplift-v2.1-10pct-seed20.npz --pr 20   # M8, 5 seeds; later runs: --sample <npz>; --dry-run
```
