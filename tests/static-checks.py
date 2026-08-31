from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]

manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
assert manifest["manifest_version"] == 3
assert manifest["version"] == "3.0.0"
assert manifest.get("version_name") == "3.0.0 RC1"
assert int(manifest.get("minimum_chrome_version", "0")) >= 111
assert manifest["permissions"] == ["storage"], "Keep requested extension permissions minimal"

for icon in manifest["icons"].values():
    assert (ROOT / icon).is_file(), f"Missing icon: {icon}"

content_scripts = manifest["content_scripts"]
assert len(content_scripts) == 2, "V3 should use separate MAIN and ISOLATED content scripts"
main_script, bridge_script = content_scripts
assert main_script.get("world") == "MAIN"
assert main_script.get("run_at") == "document_start"
assert main_script.get("js") == ["player-main.js"]
assert bridge_script.get("world") == "ISOLATED"
assert bridge_script.get("run_at") == "document_start"
assert bridge_script.get("js") == ["youtube_speed_change.js"]
assert main_script["matches"] == bridge_script["matches"]

for script in ("player-main.js", "youtube_speed_change.js", "popup.js"):
    assert (ROOT / script).is_file(), f"Missing runtime script: {script}"

popup_html = (ROOT / "popup.html").read_text(encoding="utf-8")
popup_js = (ROOT / "popup.js").read_text(encoding="utf-8")
ids = set(re.findall(r'id="([^"]+)"', popup_html))
expected_ids = {
    "statusDot",
    "statusCard",
    "statusText",
    "speedReadout",
    "effectivePill",
    "effectiveReadout",
    "speedRange",
    "speedInput",
    "decreaseSpeed",
    "increaseSpeed",
    "resetSpeed",
    "presetGrid",
    "jumpInput",
    "showToast",
    "engineLabel",
}
missing = expected_ids - ids
assert not missing, f"Popup is missing required IDs: {sorted(missing)}"
for required in expected_ids:
    assert f'"{required}"' in popup_js, f"Popup JS does not reference expected ID: {required}"

assert (ROOT / manifest["action"]["default_popup"]).is_file(), "Manifest popup is missing"
assert (ROOT / "docs/screenshots/popup-v3-preview.svg").is_file(), "README V3 popup preview is missing"
assert (ROOT / "docs/screenshots/youtube-live-preview.svg").is_file(), "README live preview is missing"
assert (ROOT / ".github/workflows/ci.yml").is_file(), "CI workflow is missing"
assert (ROOT / "docs/ARCHITECTURE.md").is_file(), "Architecture documentation is missing"
assert (ROOT / "scripts/build-release.py").is_file(), "Release packaging script is missing"

main_source = (ROOT / "player-main.js").read_text(encoding="utf-8")
bridge_source = (ROOT / "youtube_speed_change.js").read_text(encoding="utf-8")
assert "chrome." not in main_source, "MAIN-world script must not depend on extension APIs"
assert '"ytse:v3:command"' in main_source and '"ytse:v3:command"' in bridge_source
assert '"ytse:v3:state"' in main_source and '"ytse:v3:state"' in bridge_source
assert "Object.defineProperty(mediaProto, \"playbackRate\"" in main_source, "Reset guard is missing"

readme = (ROOT / "README.md").read_text(encoding="utf-8")
for stale in ("AnisHerdev", "applyBtn", "chrome.scripting.executeScript", "v2.0.1"):
    assert stale not in readme, f"Stale reference remains in README: {stale}"

print("static extension checks: ok")
