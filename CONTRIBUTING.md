# Contributing

Thanks for helping improve YouTube Video Speed Enhancer.

## Development setup

This project has no build step or runtime dependencies.

1. Clone the repository.
2. Load it as an unpacked extension from your Chromium browser's extension page.
3. Open or refresh a YouTube video.
4. Make your change.
5. Reload the extension and refresh the YouTube tab.
6. Run `npm test` before opening a pull request.

## Bug reports

For playback bugs, include:

- browser + exact version,
- operating system,
- requested speed,
- observed/effective speed,
- whether the problem survives a full page refresh,
- whether it happens after YouTube SPA navigation,
- console errors from the extension/content script if present.

Please avoid screenshots containing private tabs, account information, or unrelated personal data.

## Pull requests

Keep changes focused. Prefer one behavior change per PR. Update tests when changing speed logic, storage behavior, messaging, or YouTube lifecycle handling.

Do not add analytics, remote code, unnecessary host permissions, or large dependencies without a clear technical reason.
