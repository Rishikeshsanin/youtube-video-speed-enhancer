from __future__ import annotations

import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
version = manifest["version"]

runtime_files = [
    "manifest.json",
    "player-main.js",
    "youtube_speed_change.js",
    "popup.html",
    "popup.css",
    "popup.js",
    "assets/youtube_video_speed_icon.png",
]

for relative in runtime_files:
    path = ROOT / relative
    if not path.is_file():
        raise SystemExit(f"Missing runtime file: {relative}")

DIST.mkdir(exist_ok=True)
for old in DIST.glob("youtube-video-speed-enhancer-*.zip"):
    old.unlink()

output = DIST / f"youtube-video-speed-enhancer-v{version}.zip"
with ZipFile(output, "w", compression=ZIP_DEFLATED, compresslevel=9) as archive:
    for relative in runtime_files:
        archive.write(ROOT / relative, relative)

print(output.relative_to(ROOT))
