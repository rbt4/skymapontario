# SkyMap Historical Forecast Intelligence — lossless v2

Updated: 2026-09-26T16:46:07.753Z
Runs: 174 · atmospheric analogs: 0

## Archive progress

| Source | Cursor | Successful chunks | Empty chunks | Failures | Scored pairs |
|---|---|---:|---:|---:|---:|
| Best Match | 2026-09-18 | 62 | 0 | 67 | 130074 |
| GEM seamless | 2026-09-18 | 61 | 0 | 72 | 129990 |
| ECMWF IFS 0.25° | 2026-09-18 | 62 | 1 | 65 | 128010 |
| GFS seamless | 2026-09-19 | 62 | 0 | 68 | 130221 |
| ECMWF AIFS | 2026-09-18 | 62 | 19 | 67 | 76209 |
| Atmospheric analogs | 2022-01-01 | 0 | 0 | 174 | 0 |

## +24 h historical skill

| Source | N | Accuracy | POD | FAR | CSI | Recency-weighted accuracy | Recency-weighted CSI | Amount MAE |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| gem | 43450 | 88.6% | 51.7% | 44.5% | 36.5% | 88.6% | 36.2% | 0.14 mm |
| ifs | 42714 | 87.5% | 51.6% | 49.3% | 34.4% | 87.2% | 33.7% | 0.14 mm |
| aifs | 25450 | 85.1% | 60.6% | 57.0% | 33.6% | 84.6% | 32.7% | 0.15 mm |
| best_match | 43402 | 88.1% | 44.4% | 46.1% | 32.2% | 88.5% | 30.6% | 0.16 mm |
| gfs | 43451 | 89.0% | 37.6% | 39.3% | 30.2% | 88.9% | 29.5% | 0.16 mm |

## +48 h historical skill

| Source | N | Accuracy | POD | FAR | CSI | Recency-weighted accuracy | Recency-weighted CSI | Amount MAE |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| gem | 43402 | 83.5% | 59.9% | 59.9% | 31.6% | 83.3% | 31.0% | 0.17 mm |
| best_match | 43354 | 84.0% | 57.8% | 59.1% | 31.5% | 83.9% | 30.5% | 0.15 mm |
| gfs | 43403 | 84.8% | 52.1% | 57.9% | 30.4% | 84.3% | 30.1% | 0.15 mm |
| aifs | 25403 | 83.7% | 57.0% | 60.6% | 30.4% | 83.3% | 29.5% | 0.16 mm |
| ifs | 42670 | 86.2% | 45.7% | 54.5% | 29.5% | 85.8% | 28.9% | 0.15 mm |

## +72 h historical skill

| Source | N | Accuracy | POD | FAR | CSI | Recency-weighted accuracy | Recency-weighted CSI | Amount MAE |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| gem | 43138 | 80.3% | 59.7% | 65.7% | 27.8% | 80.3% | 27.7% | 0.17 mm |
| aifs | 25356 | 82.8% | 53.7% | 63.2% | 28.0% | 82.3% | 27.0% | 0.16 mm |
| best_match | 43318 | 82.2% | 52.5% | 63.8% | 27.3% | 82.1% | 26.5% | 0.16 mm |
| gfs | 43367 | 83.2% | 47.0% | 62.6% | 26.3% | 82.6% | 26.0% | 0.16 mm |
| ifs | 42626 | 85.2% | 41.7% | 58.4% | 26.3% | 85.0% | 26.0% | 0.16 mm |

Missing values are not interpreted as zero. A source that is absent from an early archive period contributes no score for that period. Network/API failures do not advance that source cursor, so the missing chunk is retried later.

Last run: {"at":"2026-09-26T16:46:07.753Z","sources":[{"source":"best_match","status":"retry","scored":0},{"source":"gem","status":"retry","scored":0},{"source":"ifs","status":"retry","scored":0},{"source":"gfs","status":"caught-up","scored":0},{"source":"aifs","status":"retry","scored":0}],"regime":{"status":"retry","added":0}}