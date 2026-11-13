# abkit

Experimentation toolkit for TravelPlan: deterministic variant assignment, A/B
statistics, causal estimators, uplift and forecasting, and a golden dataset that
gates the engine in CI.

The PyPI distribution is `abkit-experiments`; the import name and the command stay
`abkit` (the PyPI name `abkit` belongs to someone else).

```bash
pip install abkit-experiments
pip install "abkit-experiments[uplift,forecast]"   # budget LP, ETS and ARIMA
```

## Quickstart

```python
import numpy as np

from abkit.assignment import assign_variant, parse_definition
from abkit.stats import welch_ttest

experiment = parse_definition(
    {
        "key": "save-trip-cta-v1",
        "salt": "demo-salt",
        "holdoutBuckets": 0,
        "variants": [{"key": "control", "weight": 5000}, {"key": "treatment", "weight": 5000}],
    }
)
rng = np.random.default_rng(7)
control, treatment = [], []
for i in range(4000):  # 4,000 simulated users
    _, variant = assign_variant(experiment, f"user-{i}")
    lift = 0.3 if variant == "treatment" else 0.0  # a known injected effect
    (treatment if variant == "treatment" else control).append(rng.normal(1.0 + lift, 1.0))
result = welch_ttest(control, treatment)
print(f"estimate={result.estimate:.3f} p={result.p_value:.2g} (injected effect: 0.3)")
```

See [Methods](methods.md) for what each module does, [Results](results.md) for the
measured numbers and [Releasing](release.md) for how a version reaches PyPI.
