# Modular avatar SVG authoring contract

Status: proposed for illustrator and engineering approval.

This contract defines the source files and metadata required by the planned
`@opensymbols/avatar-svg` package. It separates art decisions from runtime code
and makes unsupported combinations fail visibly during validation.

## Coordinate systems

- The assembled symbol uses a fixed `0 0 300 300` view box.
- Each modular part has its own declared local view box and tight visual bounds.
- A limb part is authored from its proximal connector toward its distal
  connector. Metadata records both points; code does not infer them from bounds.
- The action template supplies placement anchors in the assembled coordinate
  system. Downstream parts start at the selected upstream part's actual distal
  connector.
- Artwork must not depend on CSS transforms, viewport units, fonts, filters, or
  browser-specific layout.

## Required manifest data

Each source part will have one manifest entry equivalent to:

```ts
interface AvatarPartDefinition {
  id: PartId
  artKitVersion: number
  label: string
  slot: IdentitySlotId | ActionSlotId
  sourceFile: string
  viewBox: { x: number; y: number; width: number; height: number }
  bounds: { x: number; y: number; width: number; height: number }
  layer: AvatarLayer
  colourRoles: readonly ColourRole[]
  connectors: readonly PartConnector[]
  compatibility: PartCompatibility
  approval: {
    illustrator: string
    approvedAt: string
    licence: string
  }
}

interface PartConnector {
  id: ConnectorId
  point: { x: number; y: number }
  directionDegrees: number
  seamWidth: number
  overlap: number
  connectorClass: ConnectorClass
}
```

IDs are lowercase kebab case and remain stable after release. Labels may change
without changing IDs. A changed contour, connector, compatibility rule, or
layer requires a new art-kit version.

## Slots and layers

Identity slots cover body set, head, rear hair, face, front hair, facial hair,
top, bottom, footwear, headwear, glasses, hearing device, and default mobility
equipment. Sided arm and leg slots are reserved for a later reviewed art-kit
version.

Action slots cover the body silhouette or limb variants required by the action,
left and right hands, expressions, props, chairs, and equipment-specific action
variants.

The renderer uses this fixed layer order:

1. rear equipment;
2. rear hair;
3. rear limbs;
4. body and lower clothing;
5. upper clothing;
6. front limbs and hands;
7. props;
8. head and ears;
9. face and facial hair;
10. front hair, headwear, glasses, and hearing devices;
11. foreground equipment.

An action template may choose whether a complete limb is in a rear or front
layer. It may not reorder arbitrary individual paths within another part.

## Connectors and seams

- Compatible parts use the same connector class and an equal nominal seam
  width.
- Each connector declares an overlap between 2 and 6 units at the 300-unit
  assembled scale.
- Adjacent parts must meet within 1 unit at the assembled scale.
- Overlap artwork hides the internal seam while preserving one continuous outer
  outline.
- Runtime code may translate, rotate, mirror, and uniformly scale a complete
  approved body set. It must not stretch one axis to force incompatible parts
  together.
- Clothing, skin, and equipment intersections are solved in the authored action
  variant, not with runtime clipping guesses.
- A missing connector or incompatible connector class is a validation error.

## Colour and outline rules

- Fills use declared semantic roles: `skin`, `hair`, `top`, `bottom`,
  `footwear`, `equipment`, `prop`, and `ink`.
- Source files do not contain user-selected hexadecimal colours. The renderer
  resolves named palette IDs to approved values.
- Outlines use the art kit's shared width, join, and cap tokens.
- Facial marks and small details use the `ink` role and must remain legible at
  128 pixels.
- Colour alone must not distinguish an action, hand state, equipment type, or
  selected editor option.

## Allowed SVG content

Source parts may contain:

- `svg`, `g`, `path`, `circle`, `ellipse`, `rect`, `line`, `polyline`, and
  `polygon`;
- inline geometric and presentation attributes from the approved allowlist;
- local IDs when the compiler rewrites them to collision-safe generated IDs.

Source parts must not contain:

- scripts, event attributes, stylesheets, fonts, animation, filters, masks, or
  `foreignObject`;
- `image`, `iframe`, `object`, `embed`, or external `use` elements;
- external links, network URLs, data URLs, or CSS `url()` values;
- embedded metadata copied from the visual reference or unlicensed source art;
- editor controls, hidden reference layers, raster previews, or unused paths.

The build compiler parses the allowlisted sources and produces typed React SVG
data. Runtime code does not fetch source files or use `dangerouslySetInnerHTML`.

## Action templates

Every launch action defines:

- the compatible body and equipment sets;
- root placement and layer ordering;
- part variants and connector placements;
- default expression and left/right hands;
- optional compatible prop and attachment anchor;
- mirrored behaviour;
- symbol bounds and transparent export framing.

Templates are fully authored visual compositions. They may share parts where
the illustrator approves the result, but code must not rotate a neutral limb
into a new action merely because the connector permits it.

## Delivery structure

An illustrator delivery contains:

```text
art-kit-v<version>/
  manifest.json
  identity/
  actions/
  expressions/
  hands/
  props/
  equipment/
  contact-sheets/
  LICENCE.md
  APPROVAL.md
```

The authoring source and production export are separate. Production exports
contain only the paths required for assembly. `APPROVAL.md` records the art-kit
version, reviewer roles, review date, approved contact sheets, and known
limitations. It must not contain personal research data.

## Validation and visual acceptance

Automated validation rejects:

- missing or duplicate IDs;
- undeclared slots, colour roles, connectors, or compatibility references;
- source files outside their view boxes or declared bounds;
- unsafe or external SVG content;
- unapproved or unlicensed parts;
- actions without every required body and equipment variant;
- output that depends on the supplied reference SVG or laboratory test art.

For each art-kit version, tooling renders deterministic contact sheets covering
all supported identity/action combinations at 128, 256, and 1024 pixels. Review
checks silhouette, face, hands, joint seams, clothing, prop contact, equipment,
layering, mirroring, and transparent framing.

An art-kit version is releasable only after product, illustrator,
representation, accessibility, and engineering approval is recorded. Failing
visual review returns the affected source parts to illustration; engineering
must not patch approved contours with ad hoc runtime paths.
