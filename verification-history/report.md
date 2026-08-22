# SkyMap Historical Forecast Intelligence — lossless v2

Updated: 2026-08-22T13:19:37.311Z
Runs: 43 · atmospheric analogs: 0

## Archive progress

| Source | Cursor | Successful chunks | Empty chunks | Failures | Scored pairs |
|---|---|---:|---:|---:|---:|
| Best Match | 2026-03-09 | 38 | 0 | 5 | 105822 |
| GEM seamless | 2025-09-22 | 30 | 0 | 13 | 83166 |
| ECMWF IFS 0.25° | 2026-04-20 | 40 | 1 | 3 | 109518 |
| GFS seamless | 2026-01-05 | 35 | 0 | 8 | 97323 |
| ECMWF AIFS | 2026-03-09 | 38 | 19 | 5 | 51957 |
| Atmospheric analogs | 2022-01-01 | 0 | 0 | 43 | 0 |

## +24 h historical skill

| Source | N | Accuracy | POD | FAR | CSI | Recency-weighted accuracy | Recency-weighted CSI | Amount MAE |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| gem | 27766 | 89.3% | 52.5% | 45.6% | 36.5% | 89.6% | 36.4% | 0.12 mm |
| ifs | 36550 | 87.3% | 50.4% | 45.8% | 35.3% | 86.7% | 35.7% | 0.14 mm |
| aifs | 17366 | 85.4% | 55.6% | 52.0% | 34.7% | 84.9% | 34.4% | 0.15 mm |
| best_match | 35318 | 87.4% | 45.3% | 45.9% | 32.7% | 87.1% | 31.6% | 0.15 mm |
| gfs | 32485 | 89.3% | 38.6% | 38.4% | 31.1% | 89.1% | 31.3% | 0.14 mm |

## +48 h historical skill

| Source | N | Accuracy | POD | FAR | CSI | Recency-weighted accuracy | Recency-weighted CSI | Amount MAE |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| best_match | 35270 | 84.0% | 57.6% | 56.9% | 32.7% | 83.7% | 33.1% | 0.15 mm |
| gfs | 32437 | 85.6% | 51.5% | 56.2% | 31.0% | 85.4% | 32.0% | 0.13 mm |
| aifs | 17319 | 84.2% | 52.1% | 55.8% | 31.4% | 83.7% | 31.2% | 0.16 mm |
| gem | 27718 | 84.5% | 60.2% | 60.7% | 31.2% | 84.8% | 30.8% | 0.14 mm |
| ifs | 36506 | 85.9% | 44.7% | 51.3% | 30.4% | 85.1% | 30.5% | 0.15 mm |

## +72 h historical skill

| Source | N | Accuracy | POD | FAR | CSI | Recency-weighted accuracy | Recency-weighted CSI | Amount MAE |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| best_match | 35234 | 82.2% | 52.2% | 61.6% | 28.4% | 82.0% | 28.9% | 0.16 mm |
| aifs | 17272 | 83.4% | 49.5% | 58.2% | 29.3% | 82.8% | 28.8% | 0.16 mm |
| ifs | 36462 | 84.9% | 40.8% | 55.4% | 27.1% | 84.2% | 27.6% | 0.16 mm |
| gfs | 32401 | 84.2% | 46.0% | 61.2% | 26.6% | 83.8% | 27.4% | 0.14 mm |
| gem | 27682 | 80.8% | 59.3% | 67.6% | 26.5% | 81.1% | 26.1% | 0.15 mm |

Missing values are not interpreted as zero. A source that is absent from an early archive period contributes no score for that period. Network/API failures do not advance that source cursor, so the missing chunk is retried later.

Last run: {"at":"2026-08-22T13:19:37.311Z","sources":[{"source":"best_match","status":"success","scored":2880,"usable":36288,"chunk":{"startMs":1771200000000,"endMs":1772928000000,"start":"2026-02-16","end":"2026-03-08","next":"2026-03-09","days":21}},{"source":"gem","status":"success","scored":2880,"usable":36288,"chunk":{"startMs":1756684800000,"endMs":1758412800000,"start":"2025-09-01","end":"2025-09-21","next":"2025-09-22","days":21}},{"source":"ifs","status":"success","scored":2880,"usable":18144,"chunk":{"startMs":1774828800000,"endMs":1776556800000,"start":"2026-03-30","end":"2026-04-19","next":"2026-04-20","days":21}},{"source":"gfs","status":"success","scored":2820,"usable":36288,"chunk":{"startMs":1765756800000,"endMs":1767484800000,"start":"2025-12-15","end":"2026-01-04","next":"2026-01-05","days":21}},{"source":"aifs","status":"success","scored":2880,"usable":18144,"chunk":{"startMs":1771200000000,"endMs":1772928000000,"start":"2026-02-16","end":"2026-03-08","next":"2026-03-09","days":21}}],"regime":{"status":"retry","added":0}}