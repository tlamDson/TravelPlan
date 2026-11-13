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

```bash
python -m venv analytics/.venv
analytics/.venv/Scripts/python -m pip install -e "analytics/abkit[dev]"   # bin/ on Linux/macOS
cd analytics/abkit && ../.venv/Scripts/python -m ruff check . && ../.venv/Scripts/python -m ruff format --check . && ../.venv/Scripts/python -m pytest -q
analytics/.venv/Scripts/python -m abkit.bench assignment --pr 9
analytics/.venv/Scripts/python -m abkit golden   # latest golden version; --strict: MISSING fails too; --subset ci-fast
```
