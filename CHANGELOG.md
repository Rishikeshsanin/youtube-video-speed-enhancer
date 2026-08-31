# Changelog

## 3.0.0 RC1

- Rebuilt playback control around a dual-world Manifest V3 architecture.
- Added a dedicated `player-main.js` controller in Chrome's MAIN execution world.
- Moved storage, keyboard handling, popup messaging, and indicators into an isolated bridge.
- Changed both content scripts to run at `document_start`.
- Added selective interception of `HTMLMediaElement.playbackRate` writes for custom rates so YouTube page code cannot silently reset them to a native value.
- Added YouTube player API synchronization for rates exposed by the current player.
- Added native descriptor writes as the custom-rate path.
- Expanded the maximum speed from 10× to 16×.
- Added effective playback-rate telemetry and reset-guard status to the popup.
- Added a logarithmic popup slider for better precision across the wider range.
- Added a `\` keyboard shortcut to reset to 1×.
- Added deterministic MAIN-world reset tests.
- Added reproducible release ZIP packaging.
- Updated architecture documentation, roadmap, README, CI, and repository validation.

## 2.0.1

- Added a playback-rate guard that reasserted the selected speed when YouTube reset the underlying video element.
- Added direct `ratechange`, player lifecycle, and periodic watchdog handling.
- Added actual player-rate reporting for diagnostics.

## 2.0.0

- Rebuilt the popup as a modern accessible control panel.
- Added exact-speed slider/input and common speed presets.
- Added persistent speed, jump-step, and indicator preferences.
- Replaced popup script injection with extension message passing.
- Added resilience for YouTube SPA navigation and replacement video elements.
- Added an optional in-player speed indicator.
- Prevented shortcuts from firing while typing.
- Reduced extension permissions to storage plus the declared YouTube content-script scope.
- Rebuilt documentation and added a privacy policy.

## 1.0.0

- Initial public version.
