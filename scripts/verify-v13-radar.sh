#!/usr/bin/env bash
set -euo pipefail

curl --fail --location --retry 4 --retry-all-errors --connect-timeout 15 --max-time 90 \
  --get 'https://geo.weather.gc.ca/geomet' \
  --data-urlencode 'service=WMS' \
  --data-urlencode 'version=1.3.0' \
  --data-urlencode 'request=GetCapabilities' \
  --data-urlencode 'layer=RADAR_1KM_RRAI' \
  --output /tmp/radar-capabilities.xml

grep -q 'RADAR_1KM_RRAI' /tmp/radar-capabilities.xml
grep -qi 'time' /tmp/radar-capabilities.xml

fetch_png() {
  local layer="$1"
  local style="$2"
  local output="$3"
  curl --fail --location --retry 4 --retry-all-errors --connect-timeout 15 --max-time 90 \
    --get 'https://geo.weather.gc.ca/geomet' \
    --data-urlencode 'SERVICE=WMS' \
    --data-urlencode 'VERSION=1.3.0' \
    --data-urlencode 'REQUEST=GetMap' \
    --data-urlencode "LAYERS=${layer}" \
    --data-urlencode "STYLES=${style}" \
    --data-urlencode 'CRS=EPSG:4326' \
    --data-urlencode 'BBOX=41,-84,47,-74' \
    --data-urlencode 'WIDTH=720' \
    --data-urlencode 'HEIGHT=540' \
    --data-urlencode 'FORMAT=image/png' \
    --data-urlencode 'TRANSPARENT=TRUE' \
    --output "$output"
}

fetch_png 'RADAR_1KM_RRAI' 'RADARURPPRECIPR14-LINEAR' /tmp/radar.png
fetch_png 'Radar_1km_RainPrecipRate-Extrapolation' '' /tmp/nowcast.png

python - <<'PY'
from pathlib import Path
import struct

for name in ("radar", "nowcast"):
    data = Path(f"/tmp/{name}.png").read_bytes()
    assert data[:8] == b"\x89PNG\r\n\x1a\n", f"{name} is not PNG"
    width, height = struct.unpack(">II", data[16:24])
    assert (width, height) == (720, 540), (name, width, height)
    assert len(data) > 500, f"{name} image is unexpectedly small"
    print(name, len(data), width, height)
PY
