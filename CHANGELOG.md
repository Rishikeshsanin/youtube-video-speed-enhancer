# Changelog


## 2.0.1

- Added a playback-rate guard that reasserts the selected speed when YouTube resets the underlying video element.
- Added direct `ratechange`, player lifecycle, and periodic watchdog handling for current YouTube player behavior.
- Added actual player-rate reporting to extension state for better diagnostics.

## 2.0.0

- Rebuilt the popup as a modern, accessible control panel.
- Added exact-speed slider/input and common speed presets.
- Added persistent speed, jump-step, and indicator preferences.
- Replaced popup script injection with extension message passing.
- Added resilience for YouTube single-page navigation and replaced video elements.
- Added an optional in-player speed toast.
- Prevented shortcuts from firing while typing in inputs, comments, or search fields.
- Reduced extension permissions to the storage API plus the declared YouTube content-script scope.
- Rebuilt documentation and added a privacy policy.

## 1.0.0

- Initial public version.
