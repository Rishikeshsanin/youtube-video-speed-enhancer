<div align="center">

<img src="assets/youtube_video_speed_icon.png" width="88" alt="YouTube Video Speed Enhancer icon" />

# YouTube Video Speed Enhancer

**A lightweight Chrome extension for precise YouTube playback control — from 0.25× all the way to 10×.**

No tracking. No account. No external dependencies. Just faster playback control.

![Manifest V3](https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-Vanilla-F7DF1E?style=for-the-badge&logo=javascript&logoColor=111)
![License](https://img.shields.io/badge/License-MIT-22c55e?style=for-the-badge)

</div>

---

## Preview

<div align="center">
  <img src="docs/screenshots/popup-v2.png" width="340" alt="YouTube Video Speed Enhancer popup" />
</div>

---

## Why this exists

YouTube's built-in player focuses on a small set of standard playback speeds. **YouTube Video Speed Enhancer** gives you finer control and lets you go far beyond the normal range while keeping the interaction fast enough to use every day.

The original project was a small keyboard-based speed controller. Version 2 rebuilds it as a reliable Manifest V3 extension with persistent settings, YouTube SPA navigation support, a redesigned popup, presets, and clearer user feedback.

## Features

- **0.25×–10× playback range** with precise custom values
- **One-click presets** for 0.5×, 1×, 1.5×, 2×, 3×, 4×, 6×, and 8×
- **Keyboard control** with `+` / `−`
- **Adjustable keyboard step**: 0.10×, 0.25×, 0.50×, or 1.00×
- **Persistent settings** using Chrome's extension storage
- **Automatic re-application** when YouTube replaces/reloads its video player
- **SPA navigation support** when moving between videos without a full page refresh
- **On-screen speed indicator** that can be disabled
- **Input-safe shortcuts** — typing in search/comments won't change playback speed
- **Modern accessible popup UI** with live connection state
- **No analytics, ads, remote scripts, or external runtime dependencies**

## Installation

### Load unpacked in Chrome / Edge

1. Download or clone this repository.
2. Open `chrome://extensions` in Chrome (or `edge://extensions` in Edge).
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the project folder — the folder containing `manifest.json`.
6. Open a YouTube video and pin the extension if you want quick access.

> After changing extension source files, click **Reload** on the extension card before testing again.

## Usage

| Action | Control |
| --- | --- |
| Increase speed | `+` or the popup `+` button |
| Decrease speed | `−` or the popup `−` button |
| Set exact speed | Slider or number input |
| Jump to a common speed | Preset buttons |
| Return to normal | **Reset to 1×** |
| Change shortcut increment | **Keyboard step** dropdown |

The extension remembers your selected speed and settings across YouTube page changes and browser sessions.

## Architecture

```text
.
├── manifest.json                 # Manifest V3 configuration
├── popup.html                    # Extension popup markup
├── popup.css                     # Popup design system / responsive styling
├── popup.js                      # Popup state + content-script messaging
├── youtube_speed_change.js       # YouTube player control + SPA resilience
├── assets/
│   └── youtube_video_speed_icon.png
├── docs/
│   └── screenshots/
│       └── popup-v2.png
├── PRIVACY.md
└── LICENSE
```

### How it works

The content script runs on YouTube pages and controls the page's `<video>` element directly. The popup communicates with that content script using Chrome extension message passing rather than injecting ad-hoc functions into the page. User preferences are stored with `chrome.storage.sync`, and the content script observes YouTube player changes so the chosen playback rate is re-applied when needed.

## Privacy

This extension does **not** collect or transmit browsing history, video information, personal data, analytics, or telemetry. Its only stored data is your playback-speed preference, keyboard step, and on-screen-indicator preference.

See [PRIVACY.md](PRIVACY.md) for the full privacy note.

## Development

The extension intentionally has **no build step** and **no package dependencies**.

Quick static checks:

```bash
node --check popup.js
node --check youtube_speed_change.js
python -m json.tool manifest.json > /dev/null
python tests/static-checks.py
node tests/content-script.test.cjs
```

## Version history

### v2.0.1

- Added a playback-rate guard for YouTube player resets
- Added `ratechange` + lifecycle re-application and a lightweight watchdog
- Added actual player-rate diagnostics

### v2.0.0

- Rebuilt popup UI
- Replaced script injection with content-script messaging
- Added persistent settings
- Added YouTube SPA/player replacement handling
- Added quick speed presets and configurable jump sizes
- Added on-screen feedback and safer keyboard handling
- Cleaned up permissions and project documentation

### v1.0.0

- Initial speed control using `+` and `−`
- Basic popup for speed and jump-rate changes

## License

Released under the [MIT License](LICENSE).

---

<div align="center">

Built and maintained by **Rishikesh Munnaluri**

</div>
