# SkyMap Historical Forecast Intelligence — lossless v2

Updated: 2026-10-24T11:38:42.115Z
Runs: 268 · atmospheric analogs: 0

## Archive progress

| Source | Cursor | Successful chunks | Empty chunks | Failures | Scored pairs |
|---|---|---:|---:|---:|---:|
| Best Match | 2026-10-16 | 76 | 0 | 114 | 132069 |
| GEM seamless | 2026-10-16 | 75 | 0 | 119 | 131985 |
| ECMWF IFS 0.25° | 2026-10-16 | 76 | 1 | 112 | 130005 |
| GFS seamless | 2026-10-17 | 76 | 0 | 115 | 132219 |
| ECMWF AIFS | 2026-10-16 | 76 | 19 | 114 | 78204 |
| Atmospheric analogs | 2022-01-01 | 0 | 0 | 268 | 0 |

## +24 h historical skill

| Source | N | Accuracy | POD | FAR | CSI | Recency-weighted accuracy | Recency-weighted CSI | Amount MAE |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| gem | 44115 | 88.7% | 51.7% | 44.5% | 36.6% | 88.8% | 36.3% | 0.14 mm |
| ifs | 43379 | 87.6% | 51.8% | 49.3% | 34.4% | 87.4% | 33.8% | 0.14 mm |
| aifs | 26115 | 85.2% | 60.9% | 57.1% | 33.6% | 84.9% | 32.8% | 0.15 mm |
| best_match | 44067 | 88.2% | 44.4% | 46.1% | 32.2% | 88.7% | 30.7% | 0.16 mm |
| gfs | 44117 | 89.0% | 37.5% | 39.4% | 30.2% | 89.0% | 29.4% | 0.17 mm |

## +48 h historical skill

| Source | N | Accuracy | POD | FAR | CSI | Recency-weighted accuracy | Recency-weighted CSI | Amount MAE |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| gem | 44067 | 83.7% | 59.8% | 59.9% | 31.6% | 83.5% | 30.9% | 0.16 mm |
| best_match | 44019 | 84.1% | 57.8% | 59.1% | 31.5% | 84.1% | 30.5% | 0.15 mm |
| gfs | 44069 | 84.8% | 52.0% | 58.0% | 30.3% | 84.4% | 29.8% | 0.17 mm |
| aifs | 26068 | 83.9% | 57.3% | 60.6% | 30.5% | 83.6% | 29.7% | 0.16 mm |
| ifs | 43335 | 86.3% | 45.7% | 54.6% | 29.5% | 86.0% | 28.8% | 0.15 mm |

## +72 h historical skill

| Source | N | Accuracy | POD | FAR | CSI | Recency-weighted accuracy | Recency-weighted CSI | Amount MAE |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| gem | 43803 | 80.4% | 59.6% | 65.8% | 27.8% | 80.6% | 27.6% | 0.17 mm |
| aifs | 26021 | 83.1% | 54.1% | 63.1% | 28.1% | 82.7% | 27.3% | 0.16 mm |
| best_match | 43983 | 82.4% | 52.4% | 63.8% | 27.3% | 82.4% | 26.5% | 0.16 mm |
| ifs | 43291 | 85.3% | 41.7% | 58.4% | 26.3% | 85.2% | 26.0% | 0.16 mm |
| gfs | 44033 | 83.3% | 46.9% | 62.7% | 26.3% | 82.8% | 25.9% | 0.18 mm |

Missing values are not interpreted as zero. A source that is absent from an early archive period contributes no score for that period. Network/API failures do not advance that source cursor, so the missing chunk is retried later.

Last run: {"at":"2026-10-24T11:38:42.115Z","sources":[{"source":"best_match","status":"retry","scored":0},{"source":"gem","status":"retry","scored":0},{"source":"ifs","status":"retry","scored":0},{"source":"gfs","status":"caught-up","scored":0},{"source":"aifs","status":"retry","scored":0}],"regime":{"status":"retry","added":0}}