# SkyMap Forecast Court

The Forecast Court is the release gate for any learned change to SkyMap's published model weights. It compares the current champion with one sealed challenger on the same Ontario cases and against the same later ECCC observations. It never edits production by itself.

## Sealed prospective process

Every six hours, `.github/workflows/forecast-court.yml`:

1. freezes champion and challenger predictions before truth exists;
2. records +24, +48, and +72 hour cases for eight Ontario cities;
3. waits until the forecast hour is safely in the past;
4. scores both versions against nearby ECCC climate-hourly precipitation truth;
5. publishes a bounded public status artifact from the `forecast-court-data` branch.

The candidate must pass every guardrail:

| Gate | Minimum |
| --- | ---: |
| Historical evidence per supported model and lead | 500 samples |
| Historically supported models | 3 |
| Sealed prospective cases | 300 |
| Observed wet cases | 45 |
| Cases at each lead | 60 |
| Relative Brier improvement | 2% |
| CSI degradation | no worse than 0.5 percentage points |
| Miss-rate degradation | no worse than 1.5 percentage points |
| False-alarm degradation | no worse than 2 percentage points |
| Per-lead Brier degradation | no lead worse by more than 3% |

Passing produces `approvedForBoundedIntegrationReview: true`. It does not promote the challenger. A deliberate code change, review, CI pass, merge, and deployment are still required.

## Unsupported historical sources

A source with fewer than 500 honest historical samples at any supported lead cannot acquire learned influence. It is frozen at the champion weight. The Court may evaluate a challenger when at least three models are historically supported at every lead and every unsupported model remains frozen.

This prevents a missing archive—currently relevant to AIFS—from both deadlocking the entire Court and receiving an invented benefit from normalization. Prospective cases can still include the source, so a later archive improvement can make it eligible without changing the truth standard.

## Boundaries

- champion and challenger cases are immutable after sealing;
- the same observation grades both sides;
- model agreement is not described as probability calibration;
- timing, spatial offsets, and probability calibration remain locked;
- current-device personal evidence cannot bypass this Court;
- snow is not graded by rain-radar truth;
- the Court cannot write application code or production weights.

## Verification

```bash
node scripts/forecast-regime-skill.mjs --self-test
node scripts/forecast-court.mjs --self-test
```

The first check proves that unsupported sources remain exactly at champion influence. The second proves that three supported models can enter the Court, while any movement of an unsupported model rejects the challenger.
