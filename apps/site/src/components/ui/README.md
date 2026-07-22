# Open Symbols UI components

This directory contains the internal, application-level primitives shared by the Open Symbols website. Import from `components/ui`; do not import individual files so the public path stays stable.

```tsx
import { Button, FormActions, Surface, TextField } from '../components/ui'

<Surface tone="muted">
  <TextField id="label" label="Symbol label" hint="Use a familiar word." />
  <FormActions>
    <Button variant="primary" type="submit">Save</Button>
    <Button>Cancel</Button>
  </FormActions>
</Surface>
```

## Semantics

- Use `Button` for an action, `ButtonLink` for client-side navigation, and `ButtonAnchor` for external or full-document navigation. Do not exchange their semantics for styling convenience.
- `BrandEndorsement` is a standalone link whose accessible name is computed as “by [brand name]”. Its visible “by” and icon are decorative; if the remote icon fails, the reserved icon box and working link remain. Never nest it inside another link, button, or interactive element.
- Every field requires a stable `id` and visible `label`. Hints and errors are connected through `aria-describedby`; loading disables the control and announces its state.
- Use `StatusMessage status="status"` for progress or confirmation and `status="alert"` for failures that need immediate announcement.
- `Avatar` is decorative because the adjacent profile name supplies identity. Its fallback is derived deterministically from the name.
- `EmptyState` describes absent content. Only pass an action when it genuinely works; coming-soon areas must not imply that saving is available.
- `DescriptionList` is for term/value metadata, not general two-column layout.

## Tailwind conventions

The site uses Tailwind v4 as a hybrid system:

- Design tokens live in the CSS-first `@theme` block in `styles.css`. Use those named colour, type, spacing, and radius values instead of introducing one-off equivalents.
- Shared accessible primitives keep stable semantic class names and centralized rules in `@layer components`. Do not move focus treatment, target sizing, field states, or forced-colour behavior into page markup.
- Page-specific composition may use static Tailwind utilities. Keep utility strings short, literal, and local; do not construct class names dynamically or use `@apply`.
- Complex responsive grids, native-dialog behavior, and feature states belong in a small feature stylesheet with the explicit layer order `theme, base, components, utilities`.
- Borders establish hierarchy. Shadows are reserved for the sticky header and open mobile sidecar.
- The `800px` mobile-navigation breakpoint must remain identical in CSS and TypeScript.

Components accept `className` for feature-level composition without changing their APIs. Interactive targets are at least 44px, focus uses the shared 3px treatment with surface separation, and shared surfaces support forced colours. Avoid adding motion without an equivalent reduced-motion rule.
