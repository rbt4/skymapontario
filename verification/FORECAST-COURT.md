# Forecast Court

Forecast Court is SkyMap's prospective champion-versus-challenger gate. Its job is to prevent a historically attractive calibration from being promoted merely because it looks clever in retrospective data.

## Sealed experiment

Every run retrieves the same raw GEM, IFS, GFS and AIFS forecasts for eight Ontario locations at +24, +48 and +72 hours. It creates two predictions before the outcome exists:

- **Champion:** today's fixed baseline model weights.
- **Challenger:** the current regime-conditioned shadow weights produced by Forecast Lab's historical learner.

The case stores both predictions and the exact challenger weight snapshot. After the valid time passes and ECCC observations are available, both are scored against the same truth.

## What is scored

Forecast Court tracks:

- Brier score from the weighted wet-model vote
- Critical Success Index (CSI)
- probability of detection / miss rate
- false alarm ratio
- precipitation amount MAE when comparable observations exist
- total samples and, separately, actual wet outcomes
- performance at each lead time rather than one pooled headline number

Dry-hour accuracy alone is deliberately not a promotion criterion.

## Promotion floor

The challenger is held unless all of the following are true:

1. Its proposed weights are genuinely different from the champion.
2. Historical regime evidence reaches at least 500 samples per model/lead before review.
3. The challenger snapshot is fresh.
4. The prospective court has at least 300 scored cases, including at least 45 wet truths and at least 60 cases at each +24/+48/+72 lead.
5. Brier score improves by at least 2% overall.
6. CSI is no more than 0.5 percentage points worse.
7. Miss rate is no more than 1.5 percentage points worse.
8. False alarm ratio is no more than 2 percentage points worse.
9. No individual lead is allowed to have a Brier score more than 3% worse.

Passing produces only `approvedForBoundedIntegrationReview: true`. It **does not** alter production. A code release is still required to consume the candidate weights, preserving an explicit final safety boundary.

## Why this matters

The historical learner and the prospective court answer different questions. History asks which forecast families tended to work under a given circulation regime. Forecast Court asks whether using that knowledge actually helps on new weather that was not available when the weights were generated. Both are required.
