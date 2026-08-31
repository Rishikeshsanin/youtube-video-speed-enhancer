# Architecture

## Overview

YouTube Video Speed Enhancer is a dependency-free Manifest V3 extension with two primary runtime surfaces:

1. **Popup UI** — reads user input, displays connection/player state, and sends commands.
2. **YouTube content script** — owns playback state, persists settings, watches the player lifecycle, and applies speed changes to `<video>` elements.

## Message flow

```text
Popup UI
   │
   │ chrome.tabs.sendMessage(...)
   ▼
YouTube content script
   │
   ├── reads/writes chrome.storage.sync
   ├── discovers active <video> elements
   ├── applies playbackRate/defaultPlaybackRate
   ├── observes YouTube DOM/player replacement
   └── reports requested + effective speed state
```

The popup does not inject arbitrary page functions. Communication is explicit through extension messaging.

## Persistence

Settings are stored under `ytSpeedEnhancerSettings` in `chrome.storage.sync`:

- `speed`
- `step`
- `showToast`

The content script listens for storage changes so state remains synchronized across relevant tabs/sessions.

## YouTube lifecycle handling

YouTube is a single-page application and may replace the active media element without a full page reload. The content script therefore uses:

- DOM mutation observation,
- YouTube navigation events,
- media lifecycle events,
- `ratechange` handling,
- delayed reapplication,
- a lightweight watchdog.

These mechanisms are deliberately layered because the player can change state through several independent paths.

## Testing strategy

`tests/content-script.test.cjs` runs the content script in a small simulated browser environment and verifies storage restore, clamping, keyboard behavior, replacement videos, rate-reset recovery, and message handling.

`tests/static-checks.py` validates the manifest and repository wiring.

Real YouTube behavior still requires browser testing because YouTube's production player can enforce behavior that a local DOM simulation cannot reproduce. That gap is tracked explicitly in GitHub Issues rather than hidden by unit-test success.
