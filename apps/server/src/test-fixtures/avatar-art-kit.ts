import type { AvatarArtKitManifest, CharacterActionV1, CharacterIdentityV1 } from '@opensymbols/avatar-svg/contracts'

const part = (
  id: string,
  slot: 'body' | 'head' | 'face' | 'frontHair' | 'top' | 'bottom' | 'footwear' | 'actionPart',
  role: 'skin' | 'hair' | 'top' | 'bottom' | 'footwear' | 'detail',
  layer: AvatarArtKitManifest['parts'][number]['layer'],
) => ({
  id, slot, colourRole: role, layer,
  bounds: { x: 100, y: 50, width: 100, height: 200 },
  connectors: [],
  nodes: [{ element: 'circle' as const, attributes: { cx: 150, cy: 150, r: 25, fill: 'currentColor' } }],
})

export const testAvatarArtKit: AvatarArtKitManifest = {
  version: 1,
  status: 'approved',
  palettes: [
    { id: 'skin-medium', label: 'Medium', role: 'skin', value: '#c88b6c' },
    { id: 'hair-dark', label: 'Dark', role: 'hair', value: '#211111' },
    { id: 'top-purple', label: 'Purple', role: 'top', value: '#af76ed' },
    { id: 'bottom-blue', label: 'Blue', role: 'bottom', value: '#315ea8' },
    { id: 'footwear-dark', label: 'Dark', role: 'footwear', value: '#292526' },
    { id: 'detail-dark', label: 'Detail', role: 'detail', value: '#211111' },
  ],
  parts: [
    part('body-average', 'body', 'skin', 'body-lower-clothing'),
    part('head-round', 'head', 'skin', 'head-ears'),
    part('face-friendly', 'face', 'detail', 'face-facial-hair'),
    part('hair-short', 'frontHair', 'hair', 'front-hair-accessories'),
    part('top-tshirt', 'top', 'top', 'upper-clothing'),
    part('bottom-trousers', 'bottom', 'bottom', 'body-lower-clothing'),
    part('footwear-trainers', 'footwear', 'footwear', 'front-limbs-hands'),
    part('wave-arm', 'actionPart', 'skin', 'front-limbs-hands'),
    part('face-neutral', 'actionPart', 'detail', 'face-facial-hair'),
    part('hand-relaxed', 'actionPart', 'skin', 'front-limbs-hands'),
    part('hand-open', 'actionPart', 'skin', 'front-limbs-hands'),
  ],
  actions: [{
    id: 'wave',
    label: 'Wave',
    placements: [{ partId: 'wave-arm' }],
    expressionParts: { neutral: 'face-neutral' },
    leftHandParts: { relaxed: 'hand-relaxed' },
    rightHandParts: { open: 'hand-open' },
  }],
}

export const testIdentity: CharacterIdentityV1 = {
  version: 1,
  artKitVersion: 1,
  selections: {
    body: 'body-average', head: 'head-round', face: 'face-friendly', frontHair: 'hair-short',
    top: 'top-tshirt', bottom: 'bottom-trousers', footwear: 'footwear-trainers',
  },
  colours: { skin: 'skin-medium', hair: 'hair-dark', top: 'top-purple', bottom: 'bottom-blue', footwear: 'footwear-dark' },
  sidedSelections: { hearingDevice: null, arm: null, leg: null },
}

export const testAction: CharacterActionV1 = {
  version: 1,
  actionId: 'wave',
  expressionId: 'neutral',
  leftHandId: 'relaxed',
  rightHandId: 'open',
  propId: null,
  equipmentOverrideId: null,
  mirrored: false,
}
