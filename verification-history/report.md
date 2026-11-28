# SkyMap Historical Forecast Intelligence — lossless v2

Updated: 2026-11-28T08:28:37.633Z
Runs: 352 · atmospheric analogs: 0

## Archive progress

| Source | Cursor | Successful chunks | Empty chunks | Failures | Scored pairs |
|---|---|---:|---:|---:|---:|
| Best Match | 2026-11-21 | 94 | 0 | 155 | 134637 |
| GEM seamless | 2026-11-21 | 93 | 0 | 159 | 134553 |
| ECMWF IFS 0.25° | 2026-11-21 | 94 | 1 | 152 | 132573 |
| GFS seamless | 2026-11-20 | 93 | 0 | 159 | 134658 |
| ECMWF AIFS | 2026-11-21 | 94 | 19 | 154 | 80772 |
| Atmospheric analogs | 2022-01-01 | 0 | 0 | 352 | 0 |

## +24 h historical skill

| Source | N | Accuracy | POD | FAR | CSI | Recency-weighted accuracy | Recency-weighted CSI | Amount MAE |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| gem | 44971 | 88.7% | 51.9% | 44.5% | 36.6% | 88.9% | 36.4% | 0.14 mm |
| ifs | 44235 | 87.7% | 51.9% | 49.2% | 34.5% | 87.6% | 34.1% | 0.14 mm |
| aifs | 26971 | 85.4% | 61.2% | 56.9% | 33.8% | 85.2% | 33.1% | 0.15 mm |
| best_match | 44923 | 88.3% | 44.4% | 46.0% | 32.2% | 88.9% | 30.8% | 0.16 mm |
| gfs | 44930 | 89.1% | 37.4% | 39.6% | 30.1% | 89.1% | 29.2% | 0.17 mm |

## +48 h historical skill

| Source | N | Accuracy | POD | FAR | CSI | Recency-weighted accuracy | Recency-weighted CSI | Amount MAE |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| gem | 44923 | 83.8% | 59.9% | 59.8% | 31.7% | 83.8% | 31.1% | 0.16 mm |
| best_match | 44875 | 84.2% | 57.7% | 59.1% | 31.5% | 84.3% | 30.5% | 0.15 mm |
| aifs | 26924 | 84.1% | 57.6% | 60.4% | 30.7% | 83.9% | 30.0% | 0.15 mm |
| gfs | 44882 | 84.9% | 51.9% | 58.1% | 30.2% | 84.6% | 29.7% | 0.17 mm |
| ifs | 44191 | 86.4% | 45.9% | 54.5% | 29.6% | 86.2% | 29.1% | 0.15 mm |

## +72 h historical skill

| Source | N | Accuracy | POD | FAR | CSI | Recency-weighted accuracy | Recency-weighted CSI | Amount MAE |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| gem | 44659 | 80.6% | 59.7% | 65.7% | 27.8% | 80.9% | 27.7% | 0.17 mm |
| aifs | 26877 | 83.2% | 54.5% | 62.9% | 28.3% | 83.0% | 27.6% | 0.16 mm |
| best_match | 44839 | 82.5% | 52.5% | 63.7% | 27.4% | 82.7% | 26.7% | 0.16 mm |
| ifs | 44147 | 85.5% | 42.0% | 58.2% | 26.5% | 85.5% | 26.4% | 0.16 mm |
| gfs | 44846 | 83.5% | 46.9% | 62.7% | 26.2% | 83.0% | 25.9% | 0.17 mm |

Missing values are not interpreted as zero. A source that is absent from an early archive period contributes no score for that period. Network/API failures do not advance that source cursor, so the missing chunk is retried later.

Last run: {"at":"2026-11-28T08:28:37.633Z","sources":[{"source":"best_match","status":"success","scored":144,"usable":3456,"chunk":{"startMs":1795046400000,"endMs":1795132800000,"start":"2026-11-19","end":"2026-11-20","next":"2026-11-21","days":2}},{"source":"gem","status":"success","scored":144,"usable":3456,"chunk":{"startMs":1795046400000,"endMs":1795132800000,"start":"2026-11-19","end":"2026-11-20","next":"2026-11-21","days":2}},{"source":"ifs","status":"success","scored":144,"usable":1728,"chunk":{"startMs":1795046400000,"endMs":1795132800000,"start":"2026-11-19","end":"2026-11-20","next":"2026-11-21","days":2}},{"source":"gfs","status":"retry","scored":0},{"source":"aifs","status":"success","scored":144,"usable":1728,"chunk":{"startMs":1795046400000,"endMs":1795132800000,"start":"2026-11-19","end":"2026-11-20","next":"2026-11-21","days":2}}],"regime":{"status":"retry","added":0}}