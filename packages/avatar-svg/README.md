# `@opensymbols/avatar-svg`

Shared contracts, validation, rendering, and export utilities for the modular OpenSymbols avatar system.

The checked-in production registry is intentionally `pending` and contains no visible artwork. Approved illustrator sources will be sanitized by `pnpm avatar:compile` in a later art delivery. Until then, `AvatarSvg` renders an explicit unavailable state instead of placeholder character art.

The package is split into entry points so the server can import `@opensymbols/avatar-svg/contracts` without loading React or browser code.

## Entry points

- `@opensymbols/avatar-svg/contracts` — versioned records and art-kit types for the site and server.
- `@opensymbols/avatar-svg/react` — the pure `AvatarSvg` renderer.
- `@opensymbols/avatar-svg/browser` — transparent PNG conversion from a serialized SVG.
- `@opensymbols/avatar-svg` — resolution, validation, serialization, and the production registry.

## Checks

Run `pnpm avatar:compile` after illustrator sources change, then `pnpm avatar:validate`. Package unit tests are included in `pnpm test:apps`; `pnpm avatar:test:browser` verifies 1024 × 1024 transparent PNG output in Chromium.
