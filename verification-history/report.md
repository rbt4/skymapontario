# SkyMap Historical Forecast Intelligence — lossless v2

Updated: 2026-10-03T21:46:13.102Z
Runs: 198 · atmospheric analogs: 0

## Archive progress

| Source | Cursor | Successful chunks | Empty chunks | Failures | Scored pairs |
|---|---|---:|---:|---:|---:|
| Best Match | 2026-09-26 | 66 | 0 | 77 | 130641 |
| GEM seamless | 2026-09-26 | 65 | 0 | 82 | 130557 |
| ECMWF IFS 0.25° | 2026-09-26 | 66 | 1 | 75 | 128577 |
| GFS seamless | 2026-09-25 | 65 | 0 | 82 | 130653 |
| ECMWF AIFS | 2026-09-26 | 66 | 19 | 77 | 76776 |
| Atmospheric analogs | 2022-01-01 | 0 | 0 | 198 | 0 |

## +24 h historical skill

| Source | N | Accuracy | POD | FAR | CSI | Recency-weighted accuracy | Recency-weighted CSI | Amount MAE |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| gem | 43639 | 88.6% | 51.7% | 44.5% | 36.5% | 88.7% | 36.2% | 0.14 mm |
| ifs | 42903 | 87.6% | 51.6% | 49.3% | 34.4% | 87.3% | 33.7% | 0.14 mm |
| aifs | 25639 | 85.1% | 60.7% | 57.0% | 33.6% | 84.8% | 32.7% | 0.15 mm |
| best_match | 43591 | 88.1% | 44.4% | 46.1% | 32.2% | 88.6% | 30.6% | 0.16 mm |
| gfs | 43595 | 89.0% | 37.6% | 39.3% | 30.2% | 89.0% | 29.6% | 0.16 mm |

## +48 h historical skill

| Source | N | Accuracy | POD | FAR | CSI | Recency-weighted accuracy | Recency-weighted CSI | Amount MAE |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| gem | 43591 | 83.6% | 59.9% | 59.9% | 31.6% | 83.4% | 31.0% | 0.16 mm |
| best_match | 43543 | 84.1% | 57.8% | 59.1% | 31.5% | 84.0% | 30.5% | 0.15 mm |
| gfs | 43547 | 84.8% | 52.1% | 57.9% | 30.4% | 84.3% | 30.0% | 0.15 mm |
| aifs | 25592 | 83.8% | 57.1% | 60.7% | 30.3% | 83.4% | 29.5% | 0.16 mm |
| ifs | 42859 | 86.2% | 45.7% | 54.6% | 29.5% | 85.9% | 28.8% | 0.15 mm |

## +72 h historical skill

| Source | N | Accuracy | POD | FAR | CSI | Recency-weighted accuracy | Recency-weighted CSI | Amount MAE |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| gem | 43327 | 80.3% | 59.7% | 65.8% | 27.8% | 80.4% | 27.7% | 0.17 mm |
| aifs | 25545 | 82.9% | 53.8% | 63.2% | 28.0% | 82.5% | 27.0% | 0.16 mm |
| best_match | 43507 | 82.3% | 52.5% | 63.8% | 27.3% | 82.2% | 26.4% | 0.16 mm |
| gfs | 43511 | 83.3% | 47.0% | 62.6% | 26.3% | 82.7% | 26.0% | 0.16 mm |
| ifs | 42815 | 85.3% | 41.6% | 58.4% | 26.3% | 85.1% | 26.0% | 0.16 mm |

Missing values are not interpreted as zero. A source that is absent from an early archive period contributes no score for that period. Network/API failures do not advance that source cursor, so the missing chunk is retried later.

Last run: {"at":"2026-10-03T21:46:13.102Z","sources":[{"source":"best_match","status":"caught-up","scored":0},{"source":"gem","status":"caught-up","scored":0},{"source":"ifs","status":"caught-up","scored":0},{"source":"gfs","status":"retry","scored":0},{"source":"aifs","status":"caught-up","scored":0}],"regime":{"status":"retry","added":0}}