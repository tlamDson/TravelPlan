# simkit

Seeded **simulated** TravelPlan events (virtual users, not real ones) with an experiment hook and
a fault hook. Ported from RepoPulse `simkit/` (MIT, © 2026 Lam Pham, commit `c01ae9a`) and
rebuilt around the TravelPlan event catalog: a Markov chain over the 7 web actions, 3 personas,
server-side exposure, and faults that map one-to-one onto the G-event ingest outcomes.

- **Catalog:** `simkit.catalog` reads `packages/shared/json-schema/analytics-event.schema.json`
  (exported from the Zod catalog, never copied). `replay_ingest` applies the G-event rules and
  reproduces `packages/shared/fixtures/golden-events/ingest-batch/truth.json` case by case;
  `classify` labels bad events with the backend's quarantine reasons, in the same priority.
- **Simulated, and marked as such:** every id is prefixed `sim-` (`sim-u-000001`,
  `sim-s-…`, `sim-t-…`), the manifest says `"simulated": true`, and output goes to the
  git-ignored `analytics/data/simulated/`. The catalog is strict, so events carry no extra
  marker field.
- **Personas** (`simkit.personas`): `browser` 50%, `planner` 35%, `power` 15%, each with a
  sessions/day rate and a transition matrix. Heavier personas save more often from a trip view.
- **Experiment hook** (`simkit.experiment`): users are bucketed with `abkit.assignment` (same
  variant as the server). The first entry per session into an exposure page
  (`trip_generation_completed`, `trip_viewed`) logs one `experiment_exposure` from `server`.
  After it, P(→ `target`, default `trip_saved`) is multiplied by
  `1 + relativeLift[variant][persona] + noveltyLift[variant]·0.5^(days/halfLife)`.
  `exposureLoss` drops every exposure of a share of a variant's users without changing their
  behaviour (a sample-ratio-mismatch fault). Each user has their own RNG stream, so control
  and zero-lift users behave exactly as with no experiment; the lift is the only change.
- **Fault hook** (`simkit.faults`): `duplicate`, `missing_field`, `wrong_type`,
  `unknown_field`, `unknown_event`, `wrong_source`. The manifest lists every fault with its
  expected outcome and the expected `received / accepted / duplicates / quarantined`, derived
  from the fault list alone (input must be clean).
- **Export:** canonical JSONL (`to_jsonl`, sorted keys, `\n`), and typed Parquet
  (`write_parquet`, schema-valid events only, `properties` as JSON text; `[parquet]` extra).

The relative lift acts on one transition, so the lift on a user-level metric is close to but not
exactly `relativeLift`; compare arms of the same seed to get the realised effect.

```bash
analytics/.venv/Scripts/python -m pip install -e "analytics/abkit[dev]"   # abkit first
analytics/.venv/Scripts/python -m pip install -e "analytics/simkit[dev]"
cd analytics/simkit && ../.venv/Scripts/python -m ruff check . && ../.venv/Scripts/python -m ruff format --check . && ../.venv/Scripts/python -m pytest -q

analytics/.venv/Scripts/python -m simkit.generate --users 500 --days 14 \
    --experiment experiment.json --duplicate 5 --missing-field 3 --parquet
```

`experiment.json`:

```json
{
  "definition": {
    "key": "save-trip-cta-v1",
    "salt": "sim",
    "holdoutBuckets": 0,
    "variants": [
      { "key": "control", "weight": 5000 },
      { "key": "treatment", "weight": 5000 }
    ]
  },
  "target": "trip_saved",
  "relativeLift": { "treatment": { "planner": 0.03, "power": 0.06 } },
  "noveltyLift": { "treatment": 0.02 },
  "noveltyHalfLifeDays": 7,
  "exposureLoss": {}
}
```

Writes `events.jsonl`, `users.jsonl` (per-user answer key: persona, variant, bucket,
`exposureLogged`, `firstExposedAt`), `manifest.json`, and `events.parquet` with `--parquet`
(refused when quarantine faults are planted).
