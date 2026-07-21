#!/usr/bin/env python3
from pathlib import Path
import re


def replace_text(path: Path, replacements: list[tuple[str, str]]) -> None:
    if not path.exists():
        return
    text = path.read_text(encoding="utf-8")
    for old, new in replacements:
        text = text.replace(old, new)
    path.write_text(text, encoding="utf-8")


gradle = Path("android/app/build.gradle")
text = gradle.read_text(encoding="utf-8")
text = re.sub(r"versionCode\s+\d+", "versionCode 130", text)
text = re.sub(r"versionName\s+'[^']+'", "versionName '13.0-radar-recovery'", text)
gradle.write_text(text, encoding="utf-8")

replacements = [
    ("SkyMap Ontario 12", "SkyMap Ontario 13"),
    ("v12.0-Radar-Forecast", "v13.0-Radar-Recovery"),
    ("12.0-radar-forecast", "13.0-radar-recovery"),
    ("Version 12", "Version 13"),
]
for path in (Path("index.html"), Path("privacy.html"), Path("assets/site.js")):
    replace_text(path, replacements)

page = Path("index.html")
content = page.read_text(encoding="utf-8")
proof = """
<section class="relay-proof section" id="reliability">
  <div class="relay-proof-card reveal">
    <div><small>RADAR THAT FAILS HONESTLY</small><h2>Two routes to the same official radar.</h2><p>The Android app requests ECCC GeoMet through a tightly restricted native relay, then tries the direct public connection as a fallback. The web app uses the direct feed. SkyMap keeps the last successful image instead of replacing weather with a blank map.</p></div>
    <div class="relay-flow" aria-label="Radar reliability architecture"><span>Official ECCC GeoMet</span><i>→</i><span>Native relay or direct web</span><i>→</i><strong>One verified radar image</strong></div>
  </div>
</section>
"""
if 'id="reliability"' not in content:
    content = content.replace("</main>", proof + "\n</main>")
page.write_text(content, encoding="utf-8")

css = Path("assets/site-base.css")
styles = css.read_text(encoding="utf-8")
addition = """
.relay-proof{padding-top:28px}.relay-proof-card{display:grid;padding:46px;grid-template-columns:1.05fr .95fr;align-items:center;gap:54px;border:1px solid rgba(99,221,255,.16);border-radius:28px;background:radial-gradient(circle at 100% 0,rgba(99,221,255,.11),transparent 40%),linear-gradient(145deg,#0d1b28,#07121c)}.relay-proof-card small{color:#63ddff;font:800 9px/1 Manrope,sans-serif;letter-spacing:1.7px}.relay-proof-card h2{margin:10px 0 14px;font:700 clamp(31px,3.3vw,48px)/1.03 Manrope,sans-serif;letter-spacing:-2.3px}.relay-proof-card p{max-width:590px;margin:0;color:#93a6b4;font-size:13px;line-height:1.7}.relay-flow{display:grid;gap:9px;padding:18px;border:1px solid rgba(255,255,255,.09);border-radius:19px;background:rgba(255,255,255,.025);text-align:center}.relay-flow span,.relay-flow strong{padding:13px;border-radius:13px;background:rgba(99,221,255,.07);font-size:11px}.relay-flow strong{color:#dcff7a;background:rgba(220,255,122,.08)}.relay-flow i{color:#63ddff;font-style:normal}@media(max-width:800px){.relay-proof-card{grid-template-columns:1fr;padding:30px 23px;gap:28px}}
"""
if ".relay-proof-card" not in styles:
    css.write_text(styles + "\n" + addition, encoding="utf-8")
