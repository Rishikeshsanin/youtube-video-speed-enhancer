# Roadmap

## V3 RC — reliability first

- [x] Split page control into MAIN and ISOLATED execution worlds.
- [x] Start the player engine at `document_start`.
- [x] Use YouTube's player API for rates it officially exposes to the page.
- [x] Add a native HTML media fallback for custom rates up to 16×.
- [x] Add a MAIN-world playback reset guard for non-native rates.
- [x] Surface requested vs effective playback rate in the popup.
- [x] Add deterministic tests for YouTube-side reset attempts.
- [x] Add reproducible release ZIP packaging.
- [ ] Verify 1× / 2× / 4× / 8× / 16× manually in current Brave.
- [ ] Verify the same matrix in current Chrome.
- [ ] Verify regular videos, Shorts, playlists, and post-ad transitions.

## After RC validation

- Promote V3 to stable.
- Generate a real V3 production screenshot for the README/store listing.
- Add tagged GitHub releases with CI-generated extension ZIPs.
- Prepare Chrome Web Store listing assets and checklist.
- Consider customizable shortcut bindings.
- Consider user-editable preset slots.
- Investigate Firefox MAIN-world compatibility separately.

The project remains deliberately reliability-first: new features should not weaken deterministic playback control.
