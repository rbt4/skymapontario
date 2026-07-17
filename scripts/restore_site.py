#!/usr/bin/env python3
from pathlib import Path
import base64
import hashlib
import shutil
import zipfile

ROOT = Path(__file__).resolve().parents[1]
PARTS = sorted((ROOT / ".release").glob("site.zip.b64.part*"))
EXPECTED = "7a0dfd69a866d631ab6d214c8019b9f58ffbf29aece172f795bc390fd3045e18"

if not PARTS:
    raise SystemExit("No SkyMap Ontario release parts were found")

encoded = "".join(part.read_text(encoding="ascii").strip() for part in PARTS)
archive = base64.b64decode(encoded, validate=True)
actual = hashlib.sha256(archive).hexdigest()
if actual != EXPECTED:
    raise SystemExit(f"Release checksum mismatch: {actual}")

site = ROOT / "_site"
shutil.rmtree(site, ignore_errors=True)
site.mkdir(parents=True)
zip_path = ROOT / ".release" / "skymap-site-v4.1.zip"
zip_path.write_bytes(archive)
with zipfile.ZipFile(zip_path) as bundle:
    bundle.extractall(site)
print(f"Restored SkyMap Ontario to {site} ({len(archive)} bytes, SHA-256 {actual})")
