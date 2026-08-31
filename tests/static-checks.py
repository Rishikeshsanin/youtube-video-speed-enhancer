from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]

manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
assert manifest["manifest_version"] == 3
assert manifest["version"] == "2.0.1"
assert manifest["permissions"] == ["storage"], "Keep requested extension permissions minimal"

for icon in manifest["icons"].values():
    assert (ROOT / icon).is_file(), f"Missing icon: {icon}"

popup_html = (ROOT / "popup.html").read_text(encoding="utf-8")
popup_js = (ROOT / "popup.js").read_text(encoding="utf-8")
ids = set(re.findall(r'id="([^"]+)"', popup_html))
referenced_ids = set(re.findall(r'"(statusDot|statusCard|statusText|speedReadout|speedRange|speedInput|decreaseSpeed|increaseSpeed|resetSpeed|presetGrid|jumpInput|showToast)"', popup_js))
missing = referenced_ids - ids
assert not missing, f"Popup JS references missing IDs: {sorted(missing)}"

content_script = ROOT / manifest["content_scripts"][0]["js"][0]
assert content_script.is_file(), "Manifest content script is missing"
assert (ROOT / manifest["action"]["default_popup"]).is_file(), "Manifest popup is missing"
assert (ROOT / "docs/screenshots/popup-v2.png").is_file(), "README popup preview is missing"
assert (ROOT / "docs/screenshots/youtube-live-preview.svg").is_file(), "README live preview is missing"
assert (ROOT / ".github/workflows/ci.yml").is_file(), "CI workflow is missing"
assert (ROOT / "docs/ARCHITECTURE.md").is_file(), "Architecture documentation is missing"

readme = (ROOT / "README.md").read_text(encoding="utf-8")
for stale in ("AnisHerdev", "applyBtn", "chrome.scripting.executeScript"):
    assert stale not in readme, f"Stale v1 reference remains in README: {stale}"

print("static extension checks: ok")
