# SkyMap Historical Forecast Intelligence — lossless v2

Updated: 2026-09-19T16:04:21.979Z
Runs: 147 · atmospheric analogs: 0

## Archive progress

| Source | Cursor | Successful chunks | Empty chunks | Failures | Scored pairs |
|---|---|---:|---:|---:|---:|
| Best Match | 2026-09-12 | 59 | 0 | 52 | 129642 |
| GEM seamless | 2026-09-12 | 58 | 0 | 57 | 129558 |
| ECMWF IFS 0.25° | 2026-09-12 | 59 | 1 | 50 | 127578 |
| GFS seamless | 2026-09-11 | 58 | 0 | 56 | 129651 |
| ECMWF AIFS | 2026-09-12 | 59 | 19 | 52 | 75777 |
| Atmospheric analogs | 2022-01-01 | 0 | 0 | 147 | 0 |

## +24 h historical skill

| Source | N | Accuracy | POD | FAR | CSI | Recency-weighted accuracy | Recency-weighted CSI | Amount MAE |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| gem | 43306 | 88.6% | 51.7% | 44.5% | 36.6% | 88.5% | 36.2% | 0.14 mm |
| ifs | 42570 | 87.5% | 51.6% | 49.2% | 34.4% | 87.2% | 33.7% | 0.14 mm |
| aifs | 25306 | 85.0% | 60.6% | 57.0% | 33.6% | 84.6% | 32.7% | 0.15 mm |
| best_match | 43258 | 88.1% | 44.4% | 46.1% | 32.2% | 88.5% | 30.6% | 0.16 mm |
| gfs | 43261 | 88.9% | 37.6% | 39.3% | 30.3% | 88.9% | 29.6% | 0.16 mm |

## +48 h historical skill

| Source | N | Accuracy | POD | FAR | CSI | Recency-weighted accuracy | Recency-weighted CSI | Amount MAE |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| gem | 43258 | 83.5% | 59.9% | 59.8% | 31.7% | 83.2% | 31.1% | 0.17 mm |
| best_match | 43210 | 84.0% | 57.8% | 59.1% | 31.5% | 83.8% | 30.6% | 0.15 mm |
| gfs | 43213 | 84.8% | 52.2% | 57.9% | 30.4% | 84.2% | 30.1% | 0.15 mm |
| aifs | 25259 | 83.7% | 57.0% | 60.6% | 30.4% | 83.2% | 29.6% | 0.16 mm |
| ifs | 42526 | 86.2% | 45.7% | 54.4% | 29.6% | 85.8% | 28.9% | 0.15 mm |

## +72 h historical skill

| Source | N | Accuracy | POD | FAR | CSI | Recency-weighted accuracy | Recency-weighted CSI | Amount MAE |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| gem | 42994 | 80.2% | 59.7% | 65.7% | 27.8% | 80.2% | 27.7% | 0.17 mm |
| aifs | 25212 | 82.8% | 53.7% | 63.1% | 28.0% | 82.2% | 27.1% | 0.16 mm |
| best_match | 43174 | 82.2% | 52.5% | 63.8% | 27.3% | 82.0% | 26.5% | 0.16 mm |
| gfs | 43177 | 83.2% | 47.1% | 62.6% | 26.3% | 82.5% | 26.1% | 0.16 mm |
| ifs | 42482 | 85.2% | 41.6% | 58.3% | 26.3% | 84.9% | 26.0% | 0.16 mm |

Missing values are not interpreted as zero. A source that is absent from an early archive period contributes no score for that period. Network/API failures do not advance that source cursor, so the missing chunk is retried later.

Last run: {"at":"2026-09-19T16:04:21.979Z","sources":[{"source":"best_match","status":"caught-up","scored":0},{"source":"gem","status":"caught-up","scored":0},{"source":"ifs","status":"caught-up","scored":0},{"source":"gfs","status":"retry","scored":0},{"source":"aifs","status":"caught-up","scored":0}],"regime":{"status":"retry","added":0}}