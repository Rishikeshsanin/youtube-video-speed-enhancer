# Architecture

## Why V3 is split across two execution worlds

Chrome Manifest V3 content scripts normally run in an **ISOLATED** JavaScript world. That is ideal for extension APIs such as `chrome.storage` and `chrome.runtime`, but YouTube's own player state lives in the page's **MAIN** world.

V3 therefore uses two deliberately small runtime layers:

```text
Extension popup
    │
    │ chrome.tabs.sendMessage
    ▼
ISOLATED bridge — youtube_speed_change.js
    │
    │ data-ytse-command + ytse:v3:command
    ▼
MAIN player engine — player-main.js
    │
    ├── YouTube player API when the requested rate is native/supported
    ├── native HTMLMediaElement playback-rate setter for custom rates
    ├── playback setter interception for YouTube-side resets
    └── effective-rate telemetry
    │
    │ data-ytse-state + ytse:v3:state
    ▼
ISOLATED bridge → popup
```

The two worlds communicate through DOM attributes plus DOM events. No `CustomEvent.detail` payload is required, which keeps the bridge simple across Chromium isolated-world boundaries.

## MAIN-world player engine

`player-main.js` loads at `document_start` in `world: "MAIN"`.

Responsibilities:

- discover active YouTube video elements,
- rank the most likely primary player when multiple videos exist,
- read YouTube's available playback-rate table when the player API exposes it,
- call `movie_player.setPlaybackRate()` for supported/native rates,
- apply custom rates directly through the original `HTMLMediaElement` playback-rate descriptor,
- install a guarded `playbackRate` setter wrapper before normal page execution can cache the native descriptor,
- block page-side resets only for custom rates that YouTube's player table does not support,
- recover from native/internal resets through `ratechange`, lifecycle hooks, delayed retries, and a low-frequency watchdog,
- publish requested/effective rate diagnostics back to the bridge.

The engine does **not** call `chrome.*` APIs.

## ISOLATED bridge

`youtube_speed_change.js` loads at `document_start` in `world: "ISOLATED"`.

Responsibilities:

- load and persist settings in `chrome.storage.sync`,
- receive popup messages,
- handle `+`, `−`, and `\` keyboard shortcuts,
- ignore shortcuts while the user is typing,
- render the optional in-page speed indicator,
- send configuration commands to the MAIN-world engine,
- read engine telemetry and expose it to the popup.

## Why the hard reset guard is selective

Always overriding every page write would break useful native YouTube behavior such as temporary playback boosts and normal player state updates.

V3 therefore uses the strongest interception only when the requested speed is **not present in YouTube's current playback-rate table**. For rates YouTube already supports, the extension uses YouTube's own player API and keeps its internal state synchronized.

For custom rates such as `8×`, the engine writes the real HTML media rate and rejects page attempts to overwrite it with a native value.

## Player selection

YouTube can temporarily keep multiple video elements in the document during SPA navigation, Shorts transitions, ads, or player replacement.

The engine:

1. prefers elements with the `html5-main-video` class,
2. considers whether a candidate is currently playing and ready,
3. uses visible player size as an additional signal,
4. falls back to a single page video when no YouTube-specific marker exists.

All managed candidates receive the selected target speed so a replacement video starts with the correct rate immediately.

## Recovery layers

V3 intentionally uses layered recovery rather than one aggressive polling loop:

1. **MAIN-world setter guard** — blocks JavaScript resets for non-native rates.
2. **YouTube player API sync** — keeps supported rates inside YouTube's own state model.
3. **`ratechange` listener** — handles browser/player paths that bypass the JavaScript setter wrapper.
4. **media lifecycle events** — reapply after metadata/load/play transitions.
5. **YouTube SPA events** — handle navigation without full reload.
6. **MutationObserver** — catch replacement video elements.
7. **650 ms watchdog** — only performs a corrective write when the effective rate is actually wrong.

## State protocol

Commands are serialized to the root `<html>` element under `data-ytse-command`, followed by a `ytse:v3:command` event.

State is serialized under `data-ytse-state`, followed by a `ytse:v3:state` event.

Important telemetry fields include:

- `requestedSpeed`
- `actualSpeed`
- `effectiveMatch`
- `videoCount`
- `playerApiAvailable`
- `playerApiSynced`
- `playerNativeRate`
- `hardLock`
- `prototypeGuard`
- `interceptedResets`

## Testing strategy

`tests/player-main.test.cjs` verifies the MAIN-world controller against a simulated YouTube player and a real JavaScript property descriptor. It specifically tests page-side attempts to reset a custom playback rate.

`tests/content-script.test.cjs` verifies storage, popup messaging, keyboard handling, speed clamping, and the isolated-to-main command/state protocol.

`tests/static-checks.py` verifies Manifest V3 wiring, minimum Chromium version, execution-world separation, permissions, popup/runtime files, and release packaging assumptions.

Automated tests intentionally do not claim to replace manual production YouTube verification. A release candidate is promoted only after real Chrome/Brave testing.
