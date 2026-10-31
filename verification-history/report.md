# SkyMap Historical Forecast Intelligence — lossless v2

Updated: 2026-10-31T13:05:25.879Z
Runs: 292 · atmospheric analogs: 0

## Archive progress

| Source | Cursor | Successful chunks | Empty chunks | Failures | Scored pairs |
|---|---|---:|---:|---:|---:|
| Best Match | 2026-10-24 | 80 | 0 | 125 | 132642 |
| GEM seamless | 2026-10-24 | 79 | 0 | 130 | 132558 |
| ECMWF IFS 0.25° | 2026-10-24 | 80 | 1 | 123 | 130578 |
| GFS seamless | 2026-10-23 | 79 | 0 | 128 | 132651 |
| ECMWF AIFS | 2026-10-24 | 80 | 19 | 125 | 78777 |
| Atmospheric analogs | 2022-01-01 | 0 | 0 | 292 | 0 |

## +24 h historical skill

| Source | N | Accuracy | POD | FAR | CSI | Recency-weighted accuracy | Recency-weighted CSI | Amount MAE |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| gem | 44306 | 88.7% | 51.8% | 44.4% | 36.6% | 88.8% | 36.4% | 0.14 mm |
| ifs | 43570 | 87.7% | 51.8% | 49.2% | 34.5% | 87.5% | 34.0% | 0.14 mm |
| aifs | 26306 | 85.3% | 61.1% | 57.0% | 33.7% | 85.0% | 32.9% | 0.15 mm |
| best_match | 44258 | 88.2% | 44.5% | 46.0% | 32.3% | 88.8% | 30.9% | 0.16 mm |
| gfs | 44261 | 89.0% | 37.5% | 39.4% | 30.2% | 89.1% | 29.4% | 0.17 mm |

## +48 h historical skill

| Source | N | Accuracy | POD | FAR | CSI | Recency-weighted accuracy | Recency-weighted CSI | Amount MAE |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| gem | 44258 | 83.7% | 59.9% | 59.8% | 31.6% | 83.6% | 31.0% | 0.16 mm |
| best_match | 44210 | 84.2% | 57.9% | 59.1% | 31.5% | 84.2% | 30.7% | 0.15 mm |
| aifs | 26259 | 84.0% | 57.5% | 60.5% | 30.6% | 83.7% | 29.8% | 0.16 mm |
| gfs | 44213 | 84.9% | 52.0% | 58.1% | 30.2% | 84.4% | 29.8% | 0.17 mm |
| ifs | 43526 | 86.3% | 45.9% | 54.5% | 29.6% | 86.1% | 29.0% | 0.15 mm |

## +72 h historical skill

| Source | N | Accuracy | POD | FAR | CSI | Recency-weighted accuracy | Recency-weighted CSI | Amount MAE |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| gem | 43994 | 80.5% | 59.7% | 65.7% | 27.9% | 80.6% | 27.8% | 0.17 mm |
| aifs | 26212 | 83.1% | 54.3% | 63.0% | 28.2% | 82.8% | 27.4% | 0.16 mm |
| best_match | 44174 | 82.4% | 52.5% | 63.7% | 27.3% | 82.5% | 26.6% | 0.16 mm |
| ifs | 43482 | 85.4% | 41.8% | 58.3% | 26.4% | 85.3% | 26.2% | 0.16 mm |
| gfs | 44177 | 83.4% | 46.9% | 62.7% | 26.2% | 82.9% | 25.9% | 0.18 mm |

Missing values are not interpreted as zero. A source that is absent from an early archive period contributes no score for that period. Network/API failures do not advance that source cursor, so the missing chunk is retried later.

Last run: {"at":"2026-10-31T13:05:25.879Z","sources":[{"source":"best_match","status":"caught-up","scored":0},{"source":"gem","status":"caught-up","scored":0},{"source":"ifs","status":"caught-up","scored":0},{"source":"gfs","status":"retry","scored":0},{"source":"aifs","status":"caught-up","scored":0}],"regime":{"status":"retry","added":0}}