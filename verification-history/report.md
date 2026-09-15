# SkyMap Historical Forecast Intelligence — lossless v2

Updated: 2026-09-15T21:45:54.183Z
Runs: 132 · atmospheric analogs: 0

## Archive progress

| Source | Cursor | Successful chunks | Empty chunks | Failures | Scored pairs |
|---|---|---:|---:|---:|---:|
| Best Match | 2026-09-08 | 57 | 0 | 44 | 129360 |
| GEM seamless | 2026-09-08 | 56 | 0 | 49 | 129276 |
| ECMWF IFS 0.25° | 2026-09-08 | 57 | 1 | 42 | 127296 |
| GFS seamless | 2026-09-07 | 56 | 0 | 49 | 129363 |
| ECMWF AIFS | 2026-09-08 | 57 | 19 | 44 | 75495 |
| Atmospheric analogs | 2022-01-01 | 0 | 0 | 132 | 0 |

## +24 h historical skill

| Source | N | Accuracy | POD | FAR | CSI | Recency-weighted accuracy | Recency-weighted CSI | Amount MAE |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| gem | 43212 | 88.6% | 51.6% | 44.4% | 36.5% | 88.5% | 36.2% | 0.14 mm |
| ifs | 42476 | 87.5% | 51.6% | 49.2% | 34.4% | 87.1% | 33.7% | 0.14 mm |
| aifs | 25212 | 85.0% | 60.6% | 57.0% | 33.6% | 84.5% | 32.7% | 0.15 mm |
| best_match | 43164 | 88.1% | 44.4% | 46.1% | 32.2% | 88.4% | 30.6% | 0.16 mm |
| gfs | 43165 | 88.9% | 37.7% | 39.3% | 30.3% | 88.9% | 29.7% | 0.16 mm |

## +48 h historical skill

| Source | N | Accuracy | POD | FAR | CSI | Recency-weighted accuracy | Recency-weighted CSI | Amount MAE |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| gem | 43164 | 83.5% | 59.9% | 59.8% | 31.7% | 83.2% | 31.1% | 0.17 mm |
| best_match | 43116 | 84.0% | 57.8% | 59.1% | 31.5% | 83.8% | 30.6% | 0.15 mm |
| gfs | 43117 | 84.8% | 52.2% | 57.9% | 30.4% | 84.2% | 30.1% | 0.15 mm |
| aifs | 25165 | 83.7% | 57.0% | 60.5% | 30.4% | 83.2% | 29.6% | 0.16 mm |
| ifs | 42432 | 86.2% | 45.7% | 54.4% | 29.6% | 85.8% | 29.0% | 0.15 mm |

## +72 h historical skill

| Source | N | Accuracy | POD | FAR | CSI | Recency-weighted accuracy | Recency-weighted CSI | Amount MAE |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| gem | 42900 | 80.2% | 59.7% | 65.7% | 27.9% | 80.2% | 27.8% | 0.17 mm |
| aifs | 25118 | 82.7% | 53.7% | 63.1% | 28.0% | 82.2% | 27.1% | 0.17 mm |
| best_match | 43080 | 82.2% | 52.5% | 63.7% | 27.3% | 82.0% | 26.5% | 0.16 mm |
| ifs | 42388 | 85.2% | 41.6% | 58.3% | 26.3% | 84.9% | 26.0% | 0.16 mm |
| gfs | 43081 | 83.2% | 47.0% | 62.6% | 26.3% | 82.5% | 26.0% | 0.16 mm |

Missing values are not interpreted as zero. A source that is absent from an early archive period contributes no score for that period. Network/API failures do not advance that source cursor, so the missing chunk is retried later.

Last run: {"at":"2026-09-15T21:45:54.183Z","sources":[{"source":"best_match","status":"caught-up","scored":0},{"source":"gem","status":"caught-up","scored":0},{"source":"ifs","status":"caught-up","scored":0},{"source":"gfs","status":"retry","scored":0},{"source":"aifs","status":"caught-up","scored":0}],"regime":{"status":"retry","added":0}}