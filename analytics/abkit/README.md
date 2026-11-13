# abkit

Experimentation toolkit for TravelPlan (B2 plan). This first version has:

- `abkit.assignment`: deterministic variant assignment. It matches the server
  (`backend/src/features/experiments/services/assignment.ts`) on all rows of
  `packages/shared/fixtures/assignment-vectors.json`.
- `abkit.runs`: the `analytics/runs/runs.csv` ledger. Every number quoted in a
  README must come from a row in that file.
- `abkit.bench`: runs a named benchmark and appends its result to `runs.csv`.
- `abkit golden`: runs abkit on every case of a golden dataset (default
  `analytics/golden/v1`) and prints pass/fail by each case's tolerance. Format,
  methods and freezing: `analytics/golden/README.md`.

```bash
python -m venv analytics/.venv
analytics/.venv/Scripts/python -m pip install -e "analytics/abkit[dev]"   # bin/ on Linux/macOS
cd analytics/abkit && ../.venv/Scripts/python -m ruff check . && ../.venv/Scripts/python -m ruff format --check . && ../.venv/Scripts/python -m pytest -q
analytics/.venv/Scripts/python -m abkit.bench assignment --pr 9
analytics/.venv/Scripts/python -m abkit golden analytics/golden/v1   # --strict: MISSING fails too; --subset ci-fast
```
