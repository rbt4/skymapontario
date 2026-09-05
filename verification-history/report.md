# SkyMap Historical Forecast Intelligence — lossless v2

Updated: 2026-09-05T20:43:42.367Z
Runs: 94 · atmospheric analogs: 0

## Archive progress

| Source | Cursor | Successful chunks | Empty chunks | Failures | Scored pairs |
|---|---|---:|---:|---:|---:|
| Best Match | 2026-08-29 | 52 | 0 | 25 | 128643 |
| GEM seamless | 2026-08-29 | 51 | 0 | 30 | 128559 |
| ECMWF IFS 0.25° | 2026-08-29 | 52 | 1 | 23 | 126579 |
| GFS seamless | 2026-08-28 | 51 | 0 | 30 | 128643 |
| ECMWF AIFS | 2026-08-29 | 52 | 19 | 25 | 74778 |
| Atmospheric analogs | 2022-01-01 | 0 | 0 | 94 | 0 |

## +24 h historical skill

| Source | N | Accuracy | POD | FAR | CSI | Recency-weighted accuracy | Recency-weighted CSI | Amount MAE |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| gem | 42973 | 88.6% | 51.7% | 44.4% | 36.6% | 88.5% | 36.3% | 0.14 mm |
| ifs | 42237 | 87.5% | 51.6% | 49.2% | 34.4% | 87.1% | 33.8% | 0.14 mm |
| aifs | 24973 | 85.0% | 60.3% | 56.8% | 33.6% | 84.5% | 32.7% | 0.15 mm |
| best_match | 42925 | 88.1% | 44.5% | 46.0% | 32.3% | 88.4% | 30.8% | 0.16 mm |
| gfs | 42925 | 88.9% | 37.7% | 39.2% | 30.3% | 88.8% | 29.7% | 0.16 mm |

## +48 h historical skill

| Source | N | Accuracy | POD | FAR | CSI | Recency-weighted accuracy | Recency-weighted CSI | Amount MAE |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| gem | 42925 | 83.5% | 60.0% | 59.7% | 31.7% | 83.2% | 31.2% | 0.17 mm |
| best_match | 42877 | 84.0% | 57.9% | 59.0% | 31.6% | 83.8% | 30.7% | 0.16 mm |
| gfs | 42877 | 84.8% | 52.2% | 57.7% | 30.5% | 84.2% | 30.2% | 0.16 mm |
| aifs | 24926 | 83.7% | 56.8% | 60.5% | 30.4% | 83.2% | 29.5% | 0.16 mm |
| ifs | 42193 | 86.2% | 45.7% | 54.3% | 29.6% | 85.8% | 29.0% | 0.15 mm |

## +72 h historical skill

| Source | N | Accuracy | POD | FAR | CSI | Recency-weighted accuracy | Recency-weighted CSI | Amount MAE |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| gem | 42661 | 80.2% | 59.7% | 65.6% | 27.9% | 80.2% | 27.8% | 0.17 mm |
| aifs | 24879 | 82.7% | 53.6% | 63.1% | 28.0% | 82.1% | 27.0% | 0.17 mm |
| best_match | 42841 | 82.1% | 52.5% | 63.8% | 27.3% | 81.9% | 26.5% | 0.16 mm |
| gfs | 42841 | 83.2% | 47.1% | 62.5% | 26.4% | 82.5% | 26.2% | 0.16 mm |
| ifs | 42149 | 85.2% | 41.7% | 58.2% | 26.3% | 84.9% | 26.1% | 0.16 mm |

Missing values are not interpreted as zero. A source that is absent from an early archive period contributes no score for that period. Network/API failures do not advance that source cursor, so the missing chunk is retried later.

Last run: {"at":"2026-09-05T20:43:42.367Z","sources":[{"source":"best_match","status":"caught-up","scored":0},{"source":"gem","status":"caught-up","scored":0},{"source":"ifs","status":"caught-up","scored":0},{"source":"gfs","status":"retry","scored":0},{"source":"aifs","status":"caught-up","scored":0}],"regime":{"status":"retry","added":0}}