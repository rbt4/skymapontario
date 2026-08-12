# Verification methodology notes

The scorecard compares gridded forecasts with the nearest usable ECCC hourly climate station observation. Because those are different spatial representations, results are treated as comparative evidence rather than absolute truth.

Probabilistic forecasts are evaluated with Brier score. Deterministic forecasts are evaluated with contingency-table metrics and precipitation amount MAE when station accumulation is available. REPS uses a three-hour truth window to match its three-hour precipitation threshold product.

Shared production weights remain unchanged until the archive has enough samples to support a stable comparison by source and lead time.
