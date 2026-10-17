# SkyMap Historical Forecast Intelligence — lossless v2

Updated: 2026-10-17T15:57:10.309Z
Runs: 242 · atmospheric analogs: 0

## Archive progress

| Source | Cursor | Successful chunks | Empty chunks | Failures | Scored pairs |
|---|---|---:|---:|---:|---:|
| Best Match | 2026-10-10 | 73 | 0 | 100 | 131640 |
| GEM seamless | 2026-10-10 | 72 | 0 | 105 | 131556 |
| ECMWF IFS 0.25° | 2026-10-10 | 73 | 1 | 98 | 129576 |
| GFS seamless | 2026-10-09 | 72 | 0 | 103 | 131649 |
| ECMWF AIFS | 2026-10-10 | 73 | 19 | 100 | 77775 |
| Atmospheric analogs | 2022-01-01 | 0 | 0 | 242 | 0 |

## +24 h historical skill

| Source | N | Accuracy | POD | FAR | CSI | Recency-weighted accuracy | Recency-weighted CSI | Amount MAE |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| gem | 43972 | 88.7% | 51.7% | 44.5% | 36.6% | 88.7% | 36.2% | 0.14 mm |
| ifs | 43236 | 87.6% | 51.7% | 49.3% | 34.4% | 87.4% | 33.9% | 0.14 mm |
| aifs | 25972 | 85.2% | 60.8% | 57.1% | 33.6% | 84.8% | 32.7% | 0.15 mm |
| best_match | 43924 | 88.2% | 44.4% | 46.1% | 32.2% | 88.7% | 30.6% | 0.16 mm |
| gfs | 43927 | 89.0% | 37.5% | 39.4% | 30.1% | 89.0% | 29.4% | 0.17 mm |

## +48 h historical skill

| Source | N | Accuracy | POD | FAR | CSI | Recency-weighted accuracy | Recency-weighted CSI | Amount MAE |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| gem | 43924 | 83.6% | 59.8% | 59.9% | 31.6% | 83.5% | 31.0% | 0.16 mm |
| best_match | 43876 | 84.1% | 57.8% | 59.1% | 31.5% | 84.1% | 30.5% | 0.15 mm |
| gfs | 43879 | 84.8% | 52.1% | 58.0% | 30.3% | 84.4% | 29.9% | 0.17 mm |
| aifs | 25925 | 83.9% | 57.3% | 60.6% | 30.4% | 83.6% | 29.7% | 0.16 mm |
| ifs | 43192 | 86.3% | 45.7% | 54.6% | 29.5% | 86.0% | 28.8% | 0.15 mm |

## +72 h historical skill

| Source | N | Accuracy | POD | FAR | CSI | Recency-weighted accuracy | Recency-weighted CSI | Amount MAE |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| gem | 43660 | 80.4% | 59.6% | 65.7% | 27.8% | 80.5% | 27.7% | 0.17 mm |
| aifs | 25878 | 83.0% | 54.0% | 63.1% | 28.1% | 82.6% | 27.2% | 0.16 mm |
| best_match | 43840 | 82.3% | 52.5% | 63.8% | 27.3% | 82.4% | 26.5% | 0.16 mm |
| gfs | 43843 | 83.3% | 47.0% | 62.7% | 26.3% | 82.8% | 26.0% | 0.18 mm |
| ifs | 43148 | 85.3% | 41.6% | 58.4% | 26.3% | 85.2% | 26.0% | 0.16 mm |

Missing values are not interpreted as zero. A source that is absent from an early archive period contributes no score for that period. Network/API failures do not advance that source cursor, so the missing chunk is retried later.

Last run: {"at":"2026-10-17T15:57:10.309Z","sources":[{"source":"best_match","status":"caught-up","scored":0},{"source":"gem","status":"caught-up","scored":0},{"source":"ifs","status":"caught-up","scored":0},{"source":"gfs","status":"retry","scored":0},{"source":"aifs","status":"caught-up","scored":0}],"regime":{"status":"retry","added":0}}