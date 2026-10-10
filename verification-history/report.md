# SkyMap Historical Forecast Intelligence — lossless v2

Updated: 2026-10-10T21:59:43.273Z
Runs: 219 · atmospheric analogs: 0

## Archive progress

| Source | Cursor | Successful chunks | Empty chunks | Failures | Scored pairs |
|---|---|---:|---:|---:|---:|
| Best Match | 2026-10-02 | 69 | 0 | 90 | 131070 |
| GEM seamless | 2026-10-02 | 68 | 0 | 95 | 130986 |
| ECMWF IFS 0.25° | 2026-10-02 | 69 | 1 | 88 | 129006 |
| GFS seamless | 2026-10-03 | 69 | 0 | 90 | 131223 |
| ECMWF AIFS | 2026-10-02 | 69 | 19 | 90 | 77205 |
| Atmospheric analogs | 2022-01-01 | 0 | 0 | 219 | 0 |

## +24 h historical skill

| Source | N | Accuracy | POD | FAR | CSI | Recency-weighted accuracy | Recency-weighted CSI | Amount MAE |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| gem | 43782 | 88.7% | 51.7% | 44.5% | 36.6% | 88.7% | 36.2% | 0.14 mm |
| ifs | 43046 | 87.6% | 51.6% | 49.3% | 34.4% | 87.4% | 33.7% | 0.14 mm |
| aifs | 25782 | 85.2% | 60.7% | 57.1% | 33.6% | 84.8% | 32.7% | 0.15 mm |
| best_match | 43734 | 88.2% | 44.4% | 46.1% | 32.2% | 88.6% | 30.6% | 0.16 mm |
| gfs | 43785 | 89.0% | 37.5% | 39.4% | 30.2% | 89.0% | 29.4% | 0.17 mm |

## +48 h historical skill

| Source | N | Accuracy | POD | FAR | CSI | Recency-weighted accuracy | Recency-weighted CSI | Amount MAE |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| gem | 43734 | 83.6% | 59.9% | 59.8% | 31.6% | 83.5% | 31.0% | 0.16 mm |
| best_match | 43686 | 84.1% | 57.8% | 59.1% | 31.5% | 84.0% | 30.5% | 0.15 mm |
| gfs | 43737 | 84.8% | 52.1% | 57.9% | 30.3% | 84.4% | 30.0% | 0.17 mm |
| aifs | 25735 | 83.9% | 57.1% | 60.6% | 30.4% | 83.5% | 29.6% | 0.16 mm |
| ifs | 43002 | 86.3% | 45.7% | 54.6% | 29.5% | 86.0% | 28.8% | 0.15 mm |

## +72 h historical skill

| Source | N | Accuracy | POD | FAR | CSI | Recency-weighted accuracy | Recency-weighted CSI | Amount MAE |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| gem | 43470 | 80.4% | 59.7% | 65.8% | 27.8% | 80.5% | 27.7% | 0.17 mm |
| aifs | 25688 | 83.0% | 53.8% | 63.1% | 28.0% | 82.6% | 27.0% | 0.16 mm |
| best_match | 43650 | 82.3% | 52.4% | 63.8% | 27.3% | 82.3% | 26.5% | 0.16 mm |
| gfs | 43701 | 83.3% | 47.0% | 62.6% | 26.3% | 82.8% | 26.0% | 0.18 mm |
| ifs | 42958 | 85.3% | 41.6% | 58.4% | 26.3% | 85.2% | 26.0% | 0.16 mm |

Missing values are not interpreted as zero. A source that is absent from an early archive period contributes no score for that period. Network/API failures do not advance that source cursor, so the missing chunk is retried later.

Last run: {"at":"2026-10-10T21:59:43.273Z","sources":[{"source":"best_match","status":"retry","scored":0},{"source":"gem","status":"retry","scored":0},{"source":"ifs","status":"retry","scored":0},{"source":"gfs","status":"caught-up","scored":0},{"source":"aifs","status":"retry","scored":0}],"regime":{"status":"retry","added":0}}