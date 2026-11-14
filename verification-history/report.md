# SkyMap Historical Forecast Intelligence — lossless v2

Updated: 2026-11-14T07:02:07.217Z
Runs: 323 · atmospheric analogs: 0

## Archive progress

| Source | Cursor | Successful chunks | Empty chunks | Failures | Scored pairs |
|---|---|---:|---:|---:|---:|
| Best Match | 2026-11-07 | 87 | 0 | 141 | 133638 |
| GEM seamless | 2026-11-07 | 86 | 0 | 146 | 133554 |
| ECMWF IFS 0.25° | 2026-11-07 | 87 | 1 | 139 | 131574 |
| GFS seamless | 2026-11-06 | 86 | 0 | 143 | 133656 |
| ECMWF AIFS | 2026-11-07 | 87 | 19 | 141 | 79773 |
| Atmospheric analogs | 2022-01-01 | 0 | 0 | 323 | 0 |

## +24 h historical skill

| Source | N | Accuracy | POD | FAR | CSI | Recency-weighted accuracy | Recency-weighted CSI | Amount MAE |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| gem | 44638 | 88.7% | 51.9% | 44.4% | 36.7% | 88.9% | 36.6% | 0.14 mm |
| ifs | 43902 | 87.7% | 52.0% | 49.2% | 34.6% | 87.5% | 34.2% | 0.14 mm |
| aifs | 26638 | 85.3% | 61.4% | 56.9% | 33.9% | 85.1% | 33.2% | 0.15 mm |
| best_match | 44590 | 88.3% | 44.5% | 45.9% | 32.3% | 88.8% | 31.0% | 0.16 mm |
| gfs | 44596 | 89.1% | 37.5% | 39.5% | 30.1% | 89.1% | 29.4% | 0.17 mm |

## +48 h historical skill

| Source | N | Accuracy | POD | FAR | CSI | Recency-weighted accuracy | Recency-weighted CSI | Amount MAE |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| gem | 44590 | 83.8% | 60.0% | 59.7% | 31.8% | 83.7% | 31.3% | 0.16 mm |
| best_match | 44542 | 84.2% | 57.9% | 59.0% | 31.6% | 84.3% | 30.7% | 0.15 mm |
| aifs | 26591 | 84.1% | 57.8% | 60.3% | 30.8% | 83.8% | 30.2% | 0.16 mm |
| gfs | 44548 | 84.9% | 52.0% | 58.0% | 30.3% | 84.5% | 29.8% | 0.17 mm |
| ifs | 43858 | 86.4% | 46.0% | 54.4% | 29.7% | 86.2% | 29.2% | 0.15 mm |

## +72 h historical skill

| Source | N | Accuracy | POD | FAR | CSI | Recency-weighted accuracy | Recency-weighted CSI | Amount MAE |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| gem | 44326 | 80.5% | 59.8% | 65.6% | 27.9% | 80.8% | 27.9% | 0.17 mm |
| aifs | 26544 | 83.2% | 54.6% | 62.8% | 28.4% | 82.9% | 27.8% | 0.16 mm |
| best_match | 44506 | 82.5% | 52.6% | 63.6% | 27.4% | 82.6% | 26.8% | 0.16 mm |
| ifs | 43814 | 85.4% | 42.1% | 58.1% | 26.6% | 85.4% | 26.6% | 0.16 mm |
| gfs | 44512 | 83.4% | 46.9% | 62.6% | 26.3% | 83.0% | 25.9% | 0.18 mm |

Missing values are not interpreted as zero. A source that is absent from an early archive period contributes no score for that period. Network/API failures do not advance that source cursor, so the missing chunk is retried later.

Last run: {"at":"2026-11-14T07:02:07.217Z","sources":[{"source":"best_match","status":"success","scored":141,"usable":3456,"chunk":{"startMs":1793836800000,"endMs":1793923200000,"start":"2026-11-05","end":"2026-11-06","next":"2026-11-07","days":2}},{"source":"gem","status":"success","scored":141,"usable":3456,"chunk":{"startMs":1793836800000,"endMs":1793923200000,"start":"2026-11-05","end":"2026-11-06","next":"2026-11-07","days":2}},{"source":"ifs","status":"success","scored":141,"usable":1728,"chunk":{"startMs":1793836800000,"endMs":1793923200000,"start":"2026-11-05","end":"2026-11-06","next":"2026-11-07","days":2}},{"source":"gfs","status":"retry","scored":0},{"source":"aifs","status":"success","scored":141,"usable":1728,"chunk":{"startMs":1793836800000,"endMs":1793923200000,"start":"2026-11-05","end":"2026-11-06","next":"2026-11-07","days":2}}],"regime":{"status":"retry","added":0}}