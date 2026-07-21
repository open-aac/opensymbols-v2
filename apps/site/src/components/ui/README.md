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
- Every field requires a stable `id` and visible `label`. Hints and errors are connected through `aria-describedby`; loading disables the control and announces its state.
- Use `StatusMessage status="status"` for progress or confirmation and `status="alert"` for failures that need immediate announcement.
- `Avatar` is decorative because the adjacent profile name supplies identity. Its fallback is derived deterministically from the name.
- `EmptyState` describes absent content. Only pass an action when it genuinely works; coming-soon areas must not imply that saving is available.
- `DescriptionList` is for term/value metadata, not general two-column layout.

## Styling and accessibility

Components use the global cream, white, and teal tokens and accept `className` for feature-level layout adjustments. Keep product composition and one-off navigation in feature CSS. Interactive targets are at least 44px, focus remains visible, and shared surfaces support forced colours. Avoid adding motion without an equivalent reduced-motion rule.
