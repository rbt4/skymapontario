# ERA5 deep analog memory

Forecast Lab 26 adds a separate research memory built from ERA5 reanalysis. Its purpose is not to turn old weather into a deterministic forecast. It gives SkyMap a decades-long atmospheric-pattern library that can later be joined to verified model skill.

## Why this exists

Local weather is influenced by larger-scale circulation, upstream pressure evolution, moisture transport and thermal contrasts. A useful historical analog system therefore needs more than Toronto rain totals. It needs a compact description of the atmosphere feeding Ontario.

## What is retained

The collector samples ten physically chosen sentinel regions from the eastern Pacific across Canada, the Great Lakes, the Gulf of Mexico, the Ohio Valley, the U.S. Northeast and Hudson Bay. At 12 UTC each day it derives a compact fingerprint from:

- mean-sea-level pressure
- 2 m temperature
- 2 m dew point
- 10 m wind speed and direction
- total-column integrated water vapour

The stored fingerprint contains regional values and interpretable contrasts/proxies such as west-to-east pressure gradient, Gulf-to-Great-Lakes pressure gradient, Prairie/Great-Lakes temperature contrast, moisture gradients, northward moisture-transport proxies, Great-Lakes wind components and a local cyclone-pressure proxy.

## Deliberate restraint

SkyMap does **not** store a giant raw global grid. More variables and grid cells are not automatically more predictive; they can increase storage, correlation and overfitting. The first ERA5 memory therefore keeps a small physically motivated feature set that can be tested independently.

## Lossless rules

- The archive begins at 1940-01-01.
- Downloads advance in bounded chunks on a separate scheduled workflow.
- A failed chunk does not advance the cursor.
- Missing numeric values remain missing.
- Only sufficiently complete daily fingerprints are accepted.
- The generated data lives on the force-replaced `forecast-era5-data` branch so repository history stays bounded.

## Production rule

ERA5 analogs are research evidence only. They do not directly alter the live forecast. Any later regime-conditioned weighting must beat the existing Forecast IQ in chronological out-of-sample tests and prospective verification before it is eligible for a bounded production role.
