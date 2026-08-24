import type { AvatarArtKitManifest, CharacterActionV1, CharacterIdentityV1 } from '../src/contracts.js'

export const fixtureArtKit: AvatarArtKitManifest = {
  version: 1,
  status: 'approved',
  palettes: [
    { id: 'skin-medium', label: 'Medium skin', role: 'skin', value: '#c88b6c' },
    { id: 'hair-dark', label: 'Dark hair', role: 'hair', value: '#211111' },
    { id: 'top-purple', label: 'Purple top', role: 'top', value: '#af76ed' },
    { id: 'bottom-blue', label: 'Blue bottom', role: 'bottom', value: '#315ea8' },
    { id: 'shoe-dark', label: 'Dark footwear', role: 'footwear', value: '#292526' },
    { id: 'outline-dark', label: 'Dark outline', role: 'outline', value: '#211e1d' },
    { id: 'detail-dark', label: 'Dark detail', role: 'detail', value: '#211e1d' },
  ],
  parts: [
    {
      id: 'fixture-body', slot: 'body', colourRole: 'skin', layer: 'body-lower-clothing',
      bounds: { x: 100, y: 50, width: 100, height: 220 },
      connectors: [{ id: 'neck', connectorClass: 'neck-standard', x: 150, y: 80, directionDegrees: 90, seamWidth: 20, overlap: 3 }],
      nodes: [{ element: 'path', attributes: { d: 'M120 50h60v220h-60z', fill: 'currentColor', stroke: '#211e1d', 'stroke-width': 4 } }],
    },
    {
      id: 'fixture-hair', slot: 'frontHair', colourRole: 'hair', layer: 'front-hair-accessories',
      bounds: { x: 110, y: 32, width: 80, height: 48 }, connectors: [],
      nodes: [{ element: 'ellipse', attributes: { cx: 150, cy: 56, rx: 40, ry: 24, fill: 'currentColor' } }],
    },
    {
      id: 'fixture-wave-arm', slot: 'actionPart', colourRole: 'skin', layer: 'front-limbs-hands',
      bounds: { x: 180, y: 70, width: 50, height: 110 }, connectors: [],
      nodes: [{ element: 'path', attributes: { d: 'M180 180L210 70L230 78L200 184Z', fill: 'currentColor' } }],
    },
    {
      id: 'fixture-left-hand', slot: 'actionPart', colourRole: 'skin', layer: 'front-limbs-hands',
      bounds: { x: 105, y: 170, width: 20, height: 20 }, connectors: [],
      nodes: [{ element: 'circle', attributes: { cx: 115, cy: 180, r: 10, fill: 'currentColor' } }],
    },
    {
      id: 'fixture-right-hand', slot: 'actionPart', colourRole: 'skin', layer: 'front-limbs-hands',
      bounds: { x: 210, y: 54, width: 20, height: 20 }, connectors: [],
      nodes: [{ element: 'circle', attributes: { cx: 220, cy: 64, r: 10, fill: 'currentColor' } }],
    },
    {
      id: 'fixture-neutral-face', slot: 'actionPart', colourRole: 'detail', layer: 'face-facial-hair',
      bounds: { x: 132, y: 80, width: 36, height: 20 }, connectors: [],
      nodes: [{ element: 'line', attributes: { x1: 136, y1: 90, x2: 164, y2: 90, stroke: 'currentColor', 'stroke-width': 3, 'stroke-linecap': 'round' } }],
    },
  ],
  actions: [{
    id: 'wave', label: 'Wave', placements: [{ partId: 'fixture-wave-arm' }],
    expressionParts: { neutral: 'fixture-neutral-face' },
    leftHandParts: { relaxed: 'fixture-left-hand' },
    rightHandParts: { open: 'fixture-right-hand' },
  }],
}

export const fixtureIdentity: CharacterIdentityV1 = {
  version: 1,
  artKitVersion: 1,
  selections: { body: 'fixture-body', frontHair: 'fixture-hair' },
  colours: { skin: 'skin-medium', hair: 'hair-dark', top: 'top-purple', bottom: 'bottom-blue', footwear: 'shoe-dark' },
  sidedSelections: { hearingDevice: null, arm: null, leg: null },
}

export const fixtureAction: CharacterActionV1 = {
  version: 1,
  actionId: 'wave',
  expressionId: 'neutral',
  leftHandId: 'relaxed',
  rightHandId: 'open',
  propId: null,
  equipmentOverrideId: null,
  mirrored: false,
}
