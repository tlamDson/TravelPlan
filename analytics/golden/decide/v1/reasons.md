# G-decide labels: who labelled and why

Rater: an LLM subagent (Claude) started with no project context, which read only the 30 blinded readouts in `readouts/` (never `key.json`, the code or the plan) and decided each one as an independent analyst. The owner (Lam) reviewed and approved all 30 labels on 2026-11-13 without changes. M11 results on these labels are reported as "LLM rater, owner-reviewed", not as a human analyst's labels.

| Readout | Label | Reason |
|---|---|---|
| R01 | ship | Spend per user rose +0.77 (+118%), CI [+0.49, +1.06], p < 0.0001, with a clean 50/50 split (SRM p = 0.996). |
| R02 | ship | Value per user rose +302 (+28.9%), CI [+128, +476], p = 0.0007, and the split is fine (SRM p = 0.38). |
| R03 | investigate | The split is 55.3/44.7 with SRM p = 2.3e-06, below the 0.0005 alert, so the flat -2.1% result cannot be trusted yet. |
| R04 | investigate | The +36.7% lift (p < 0.0001) comes with a 58.7/41.3 split and SRM p = 2.2e-14, so the assignment is broken. |
| R05 | ship | Saves rose +1.87 (+32.0%), CI [+1.08, +2.66], p < 0.0001, with a healthy split (SRM p = 0.20). |
| R06 | no_ship | At the planned horizon the lift is +2.6% with p = 0.67; the only significant interim look (day 9, p = 0.046) was a peek that faded. |
| R07 | investigate | The split is 54.4/45.6 with SRM p = 7.5e-05, below the 0.0005 alert, so the flat -0.9% result needs a look first. |
| R08 | ship | Saves per view rose +0.113 (+20.3%), CI [+0.088, +0.138], p < 0.0001, with a clean split (SRM p = 0.87). |
| R09 | ship | Visit rate rose +7.7 points (+72%), CI [+7.0, +8.3] points, p < 0.0001, with a clean 50/50 split. |
| R10 | no_ship | Saves moved -3.4%, CI [-0.89, +0.48], p = 0.56: no evidence of a gain. |
| R11 | no_ship | Saves per view moved -2.6%, CI [-0.038, +0.009], p = 0.23: no evidence of a gain. |
| R12 | ship | Value per user rose +496 (+52.2%), CI [+313, +678], p < 0.0001, with a fine split (SRM p = 0.43). |
| R13 | no_ship | The primary late-window saves are -4.4% (p = 0.47); the +23.4% early-window lift looks like a novelty effect that faded. |
| R14 | no_ship | At the planned horizon the lift is +8.7% with p = 0.15; the interim looks that passed p < 0.05 were peeking. |
| R15 | no_ship | Value per user is +8.7%, but the CI [-71, +242] includes zero and p = 0.29. |
| R16 | no_ship | The primary late-window saves are only +2.7% (p = 0.67); the +32% early lift is novelty that did not last. |
| R17 | ship | Saves rose +1.73 (+28.6%), CI [+0.92, +2.54], p < 0.0001, with a fine split (SRM p = 0.66). |
| R18 | no_ship | Saves are +2.9%, but the CI [-0.53, +0.88] includes zero and p = 0.63. |
| R19 | ship | Saves per view rose +0.038 (+6.7%), CI [+0.014, +0.063], p = 0.0022, with a clean split (SRM p = 0.69). |
| R20 | no_ship | Saves are +4.9%, but the CI [-0.41, +0.96] includes zero and p = 0.43. |
| R21 | ship | Saves rose +2.42 (+38.4%), CI [+1.55, +3.28], p < 0.0001, with a near-perfect split (SRM p = 0.95). |
| R22 | no_ship | Saves fell -0.66 (-11.9%), CI [-1.28, -0.04], p = 0.038: the treatment hurts. |
| R23 | no_ship | Saves moved -2.7%, CI [-0.84, +0.52], p = 0.64: no evidence of a gain. |
| R24 | ship | Saves rose +2.07 (+38.4%), CI [+1.43, +2.72], p < 0.0001, with a clean split (SRM p = 0.77). |
| R25 | ship | Late-window saves (the primary) rose +2.27 (+38.6%), p < 0.0001, so the gain lasts past the early +58.8%. |
| R26 | ship | Saves rose +1.91 (+34.5%), CI [+1.27, +2.55], p < 0.0001, with a fine split (SRM p = 0.12). |
| R27 | no_ship | At the planned horizon saves are -1.2% (p = 0.83); the day-9 interim p = 0.043 was a peek that faded. |
| R28 | ship | Saves rose +1.61 (+25.6%), p = 0.0001; the effect varies by persona (Q p < 0.0001), but no persona is hurt (browser -0.03, p = 0.48). |
| R29 | no_ship | Saves moved -4.3%, CI [-0.99, +0.44], p = 0.45: no evidence of a gain. |
| R30 | ship | Saves rose +0.99 (+15.8%), CI [+0.39, +1.58], p = 0.0012, with a clean split (SRM p = 0.64). |
