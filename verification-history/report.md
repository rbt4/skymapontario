# SkyMap Historical Forecast Intelligence — lossless v2

Updated: 2026-11-07T13:34:22.400Z
Runs: 308 · atmospheric analogs: 0

## Archive progress

| Source | Cursor | Successful chunks | Empty chunks | Failures | Scored pairs |
|---|---|---:|---:|---:|---:|
| Best Match | 2026-10-30 | 83 | 0 | 134 | 133074 |
| GEM seamless | 2026-10-30 | 82 | 0 | 139 | 132990 |
| ECMWF IFS 0.25° | 2026-10-30 | 83 | 1 | 132 | 131010 |
| GFS seamless | 2026-10-31 | 83 | 0 | 135 | 133227 |
| ECMWF AIFS | 2026-10-30 | 83 | 19 | 134 | 79209 |
| Atmospheric analogs | 2022-01-01 | 0 | 0 | 308 | 0 |

## +24 h historical skill

| Source | N | Accuracy | POD | FAR | CSI | Recency-weighted accuracy | Recency-weighted CSI | Amount MAE |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| gem | 44450 | 88.7% | 51.8% | 44.5% | 36.6% | 88.9% | 36.4% | 0.14 mm |
| ifs | 43714 | 87.7% | 51.9% | 49.2% | 34.5% | 87.5% | 34.0% | 0.14 mm |
| aifs | 26450 | 85.3% | 61.1% | 57.1% | 33.7% | 85.0% | 32.9% | 0.15 mm |
| best_match | 44402 | 88.3% | 44.5% | 46.0% | 32.3% | 88.8% | 30.8% | 0.16 mm |
| gfs | 44453 | 89.1% | 37.5% | 39.5% | 30.1% | 89.1% | 29.3% | 0.17 mm |

## +48 h historical skill

| Source | N | Accuracy | POD | FAR | CSI | Recency-weighted accuracy | Recency-weighted CSI | Amount MAE |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| gem | 44402 | 83.7% | 59.9% | 59.8% | 31.6% | 83.7% | 31.0% | 0.16 mm |
| best_match | 44354 | 84.2% | 57.8% | 59.1% | 31.5% | 84.3% | 30.6% | 0.15 mm |
| aifs | 26403 | 84.1% | 57.5% | 60.5% | 30.6% | 83.8% | 29.9% | 0.16 mm |
| gfs | 44405 | 84.9% | 52.0% | 58.1% | 30.2% | 84.5% | 29.8% | 0.17 mm |
| ifs | 43670 | 86.4% | 45.9% | 54.5% | 29.6% | 86.2% | 29.0% | 0.15 mm |

## +72 h historical skill

| Source | N | Accuracy | POD | FAR | CSI | Recency-weighted accuracy | Recency-weighted CSI | Amount MAE |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| gem | 44138 | 80.5% | 59.7% | 65.7% | 27.9% | 80.8% | 27.8% | 0.17 mm |
| aifs | 26356 | 83.2% | 54.3% | 63.0% | 28.2% | 82.9% | 27.4% | 0.16 mm |
| best_match | 44318 | 82.4% | 52.5% | 63.7% | 27.3% | 82.6% | 26.6% | 0.16 mm |
| ifs | 43626 | 85.4% | 41.9% | 58.3% | 26.4% | 85.4% | 26.2% | 0.16 mm |
| gfs | 44369 | 83.4% | 46.9% | 62.7% | 26.2% | 83.0% | 25.8% | 0.18 mm |

Missing values are not interpreted as zero. A source that is absent from an early archive period contributes no score for that period. Network/API failures do not advance that source cursor, so the missing chunk is retried later.

Last run: {"at":"2026-11-07T13:34:22.400Z","sources":[{"source":"best_match","status":"retry","scored":0},{"source":"gem","status":"retry","scored":0},{"source":"ifs","status":"retry","scored":0},{"source":"gfs","status":"caught-up","scored":0},{"source":"aifs","status":"retry","scored":0}],"regime":{"status":"retry","added":0}}