## Summary

Describe the focused change and the user-visible behavior it affects.

## Validation

- [ ] `npm test`
- [ ] `npm run package`
- [ ] Reloaded the unpacked extension
- [ ] Refreshed the YouTube tab
- [ ] Tested 1×, 2×, 4×, and at least one custom high rate (8×/12×/16×)
- [ ] Confirmed **Requested** and **Effective** speed agree in the popup
- [ ] Tested normal page load
- [ ] Tested YouTube SPA navigation when relevant
- [ ] Tested Shorts / alternate player surfaces when relevant

## Playback-engine changes

- [ ] MAIN-world behavior has a regression test when applicable
- [ ] ISOLATED bridge/storage behavior has a regression test when applicable
- [ ] No busy-loop or unconditional high-frequency DOM scanning was introduced

## Privacy / permissions

- [ ] No new telemetry or remote code
- [ ] No new permission unless documented and justified
