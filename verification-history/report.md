# SkyMap Historical Forecast Intelligence — lossless v2

Updated: 2026-11-21T07:42:51.743Z
Runs: 338 · atmospheric analogs: 0

## Archive progress

| Source | Cursor | Successful chunks | Empty chunks | Failures | Scored pairs |
|---|---|---:|---:|---:|---:|
| Best Match | 2026-11-13 | 90 | 0 | 148 | 134064 |
| GEM seamless | 2026-11-13 | 89 | 0 | 153 | 133980 |
| ECMWF IFS 0.25° | 2026-11-13 | 90 | 1 | 146 | 132000 |
| GFS seamless | 2026-11-14 | 90 | 0 | 151 | 134226 |
| ECMWF AIFS | 2026-11-13 | 90 | 19 | 148 | 80199 |
| Atmospheric analogs | 2022-01-01 | 0 | 0 | 338 | 0 |

## +24 h historical skill

| Source | N | Accuracy | POD | FAR | CSI | Recency-weighted accuracy | Recency-weighted CSI | Amount MAE |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| gem | 44780 | 88.7% | 51.9% | 44.5% | 36.7% | 88.8% | 36.5% | 0.14 mm |
| ifs | 44044 | 87.7% | 52.0% | 49.2% | 34.6% | 87.5% | 34.1% | 0.14 mm |
| aifs | 26780 | 85.3% | 61.4% | 56.9% | 33.9% | 85.1% | 33.2% | 0.15 mm |
| best_match | 44732 | 88.3% | 44.5% | 46.0% | 32.3% | 88.8% | 30.9% | 0.16 mm |
| gfs | 44786 | 89.0% | 37.4% | 39.5% | 30.1% | 89.1% | 29.3% | 0.17 mm |

## +48 h historical skill

| Source | N | Accuracy | POD | FAR | CSI | Recency-weighted accuracy | Recency-weighted CSI | Amount MAE |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| gem | 44732 | 83.7% | 60.0% | 59.8% | 31.7% | 83.7% | 31.1% | 0.16 mm |
| best_match | 44684 | 84.2% | 57.8% | 59.1% | 31.5% | 84.2% | 30.6% | 0.15 mm |
| aifs | 26733 | 84.1% | 57.8% | 60.4% | 30.7% | 83.8% | 30.1% | 0.16 mm |
| gfs | 44738 | 84.9% | 51.9% | 58.1% | 30.2% | 84.5% | 29.8% | 0.17 mm |
| ifs | 44000 | 86.4% | 45.9% | 54.5% | 29.6% | 86.2% | 29.1% | 0.15 mm |

## +72 h historical skill

| Source | N | Accuracy | POD | FAR | CSI | Recency-weighted accuracy | Recency-weighted CSI | Amount MAE |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| gem | 44468 | 80.5% | 59.7% | 65.7% | 27.9% | 80.8% | 27.8% | 0.17 mm |
| aifs | 26686 | 83.2% | 54.7% | 62.9% | 28.4% | 82.9% | 27.7% | 0.16 mm |
| best_match | 44648 | 82.5% | 52.6% | 63.6% | 27.4% | 82.6% | 26.8% | 0.16 mm |
| ifs | 43956 | 85.4% | 42.1% | 58.2% | 26.5% | 85.4% | 26.5% | 0.16 mm |
| gfs | 44702 | 83.4% | 46.9% | 62.7% | 26.2% | 82.9% | 25.9% | 0.18 mm |

Missing values are not interpreted as zero. A source that is absent from an early archive period contributes no score for that period. Network/API failures do not advance that source cursor, so the missing chunk is retried later.

Last run: {"at":"2026-11-21T07:42:51.743Z","sources":[{"source":"best_match","status":"retry","scored":0},{"source":"gem","status":"retry","scored":0},{"source":"ifs","status":"retry","scored":0},{"source":"gfs","status":"success","scored":141,"usable":3456,"chunk":{"startMs":1794441600000,"endMs":1794528000000,"start":"2026-11-12","end":"2026-11-13","next":"2026-11-14","days":2}},{"source":"aifs","status":"retry","scored":0}],"regime":{"status":"retry","added":0}}