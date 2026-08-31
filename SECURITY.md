# Security Policy

## Supported version

Security fixes are applied to the latest supported release line. During the v3 release-candidate period, fixes land on `main` first and are carried into the next packaged release.

## Reporting a vulnerability

Please do not publish exploitable security details in a public issue.

For sensitive reports, contact the maintainer through the contact information available on the GitHub profile associated with this repository. Include a clear reproduction, affected version, impact, and suggested mitigation if known.

## Security principles

This extension intentionally:

- requests only the `storage` permission,
- limits host access to YouTube through declarative content-script matches,
- contains no remote executable code,
- contains no analytics or tracking,
- has no runtime dependency supply chain,
- does not transmit browsing or video data.

The v3 player engine includes a MAIN-world content script because reliable interaction with YouTube's own player state requires page-world execution. The companion ISOLATED bridge remains responsible for extension APIs and persistence, keeping page-world code deliberately small and free of `chrome.*` APIs.
