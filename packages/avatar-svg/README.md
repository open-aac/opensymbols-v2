# `@opensymbols/avatar-svg`

Shared contracts, validation, rendering, and export utilities for the modular OpenSymbols avatar system.

The checked-in production registry is intentionally `pending` and contains no visible artwork. Approved illustrator sources will be sanitized by `pnpm avatar:compile` in a later art delivery. Until then, `AvatarSvg` renders an explicit unavailable state instead of placeholder character art.

`developmentArtKit` contains original engineering drawings for the local character creator. It tests identity choices, rendering, and storage. It is not illustrator-approved art and must not replace `productionArtKit`. The local server opts into it with `AVATAR_ART_KIT=development`; the production server does not.

Equipment that changes posture uses an art-kit composition. For example, the development wheelchair composition replaces the selected standing body, clothing, and footwear with matching seated variants while keeping the saved identity choices unchanged. This prevents equipment from being drawn as an overlay on an incompatible standing character.

Body templates can also declare modular part compositions. The development kit uses this to assemble independently registered upper arms and forearms through shoulder, elbow, and wrist connector contracts; seated bodies reuse the upper arms and select seated forearms.

The package is split into entry points so the server can import `@opensymbols/avatar-svg/contracts` without loading React or browser code.

## Entry points

- `@opensymbols/avatar-svg/contracts` — versioned records and art-kit types for the site and server.
- `@opensymbols/avatar-svg/react` — the pure `AvatarSvg` renderer.
- `@opensymbols/avatar-svg/browser` — transparent PNG conversion from a serialized SVG.
- `@opensymbols/avatar-svg` — resolution, validation, serialization, and the production registry.

## Checks

Run `pnpm avatar:compile` after illustrator sources change, then `pnpm avatar:validate`. Package unit tests are included in `pnpm test:apps`; `pnpm avatar:test:browser` verifies 1024 × 1024 transparent PNG output in Chromium.
