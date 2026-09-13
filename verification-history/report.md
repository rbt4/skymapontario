# SkyMap Historical Forecast Intelligence — lossless v2

Updated: 2026-09-13T12:17:19.595Z
Runs: 123 · atmospheric analogs: 0

## Archive progress

| Source | Cursor | Successful chunks | Empty chunks | Failures | Scored pairs |
|---|---|---:|---:|---:|---:|
| Best Match | 2026-09-06 | 56 | 0 | 41 | 129216 |
| GEM seamless | 2026-09-06 | 55 | 0 | 46 | 129132 |
| ECMWF IFS 0.25° | 2026-09-06 | 56 | 1 | 39 | 127152 |
| GFS seamless | 2026-09-05 | 55 | 0 | 43 | 129219 |
| ECMWF AIFS | 2026-09-06 | 56 | 19 | 41 | 75351 |
| Atmospheric analogs | 2022-01-01 | 0 | 0 | 123 | 0 |

## +24 h historical skill

| Source | N | Accuracy | POD | FAR | CSI | Recency-weighted accuracy | Recency-weighted CSI | Amount MAE |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| gem | 43164 | 88.5% | 51.6% | 44.4% | 36.5% | 88.5% | 36.2% | 0.14 mm |
| ifs | 42428 | 87.5% | 51.6% | 49.2% | 34.4% | 87.1% | 33.8% | 0.14 mm |
| aifs | 25164 | 85.0% | 60.6% | 57.0% | 33.6% | 84.5% | 32.7% | 0.15 mm |
| best_match | 43116 | 88.0% | 44.4% | 46.1% | 32.2% | 88.4% | 30.6% | 0.16 mm |
| gfs | 43117 | 88.9% | 37.7% | 39.3% | 30.3% | 88.9% | 29.7% | 0.16 mm |

## +48 h historical skill

| Source | N | Accuracy | POD | FAR | CSI | Recency-weighted accuracy | Recency-weighted CSI | Amount MAE |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| gem | 43116 | 83.5% | 59.9% | 59.8% | 31.7% | 83.1% | 31.1% | 0.17 mm |
| best_match | 43068 | 84.0% | 57.8% | 59.0% | 31.5% | 83.8% | 30.6% | 0.16 mm |
| gfs | 43069 | 84.8% | 52.2% | 57.9% | 30.4% | 84.2% | 30.1% | 0.16 mm |
| aifs | 25117 | 83.6% | 57.0% | 60.5% | 30.4% | 83.1% | 29.6% | 0.16 mm |
| ifs | 42384 | 86.2% | 45.7% | 54.4% | 29.6% | 85.8% | 29.0% | 0.15 mm |

## +72 h historical skill

| Source | N | Accuracy | POD | FAR | CSI | Recency-weighted accuracy | Recency-weighted CSI | Amount MAE |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| gem | 42852 | 80.2% | 59.7% | 65.7% | 27.9% | 80.1% | 27.8% | 0.17 mm |
| aifs | 25070 | 82.7% | 53.7% | 63.1% | 28.0% | 82.1% | 27.1% | 0.17 mm |
| best_match | 43032 | 82.2% | 52.5% | 63.7% | 27.3% | 82.0% | 26.5% | 0.16 mm |
| ifs | 42340 | 85.2% | 41.6% | 58.3% | 26.3% | 84.9% | 26.0% | 0.16 mm |
| gfs | 43033 | 83.2% | 47.0% | 62.6% | 26.3% | 82.5% | 26.0% | 0.16 mm |

Missing values are not interpreted as zero. A source that is absent from an early archive period contributes no score for that period. Network/API failures do not advance that source cursor, so the missing chunk is retried later.

Last run: {"at":"2026-09-13T12:17:19.595Z","sources":[{"source":"best_match","status":"caught-up","scored":0},{"source":"gem","status":"caught-up","scored":0},{"source":"ifs","status":"caught-up","scored":0},{"source":"gfs","status":"retry","scored":0},{"source":"aifs","status":"caught-up","scored":0}],"regime":{"status":"retry","added":0}}