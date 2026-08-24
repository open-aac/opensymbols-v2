import type {
  AvatarArtKitManifest,
  CharacterActionV1,
  CharacterIdentityV1,
  CompiledSvgNode,
  IdentitySlotId,
  SvgPartDefinition,
} from './contracts.js'

const outline = '#2b2422'

function path(d: string, fill = 'currentColor', strokeWidth = 5): CompiledSvgNode {
  return {
    element: 'path',
    attributes: {
      d,
      fill,
      stroke: outline,
      'stroke-width': strokeWidth,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    },
  }
}

function line(x1: number, y1: number, x2: number, y2: number, width = 4): CompiledSvgNode {
  return {
    element: 'line',
    attributes: {
      x1, y1, x2, y2,
      stroke: 'currentColor',
      'stroke-width': width,
      'stroke-linecap': 'round',
    },
  }
}

function part(
  id: string,
  slot: IdentitySlotId | 'actionPart',
  colourRole: SvgPartDefinition['colourRole'],
  layer: SvgPartDefinition['layer'],
  nodes: readonly CompiledSvgNode[],
): SvgPartDefinition {
  return {
    id,
    slot,
    colourRole,
    layer,
    bounds: { x: 8, y: 8, width: 284, height: 284 },
    connectors: [],
    nodes,
  }
}

function body(id: string, shoulder: number, armWidth: number, hip: number, legWidth: number): SvgPartDefinition {
  const leftShoulder = 150 - shoulder
  const rightShoulder = 150 + shoulder
  const leftHip = 150 - hip
  const rightHip = 150 + hip
  return part(id, 'body', 'skin', 'body-lower-clothing', [
    path(`M${leftShoulder + 5} 112 C${leftShoulder - 8} 113 ${leftShoulder - 18} 126 ${leftShoulder - 20} 145 L${leftShoulder - 26} 207 C${leftShoulder - 27} 218 ${leftShoulder - 20} 225 ${leftShoulder - 12} 225 C${leftShoulder - 4} 225 ${leftShoulder + 1} 218 ${leftShoulder} 208 L${leftShoulder + armWidth} 148 C${leftShoulder + armWidth + 2} 131 ${leftShoulder + armWidth + 7} 120 ${leftShoulder + 5} 112 Z`),
    path(`M${rightShoulder - 5} 112 C${rightShoulder + 8} 113 ${rightShoulder + 18} 126 ${rightShoulder + 20} 145 L${rightShoulder + 26} 207 C${rightShoulder + 27} 218 ${rightShoulder + 20} 225 ${rightShoulder + 12} 225 C${rightShoulder + 4} 225 ${rightShoulder - 1} 218 ${rightShoulder} 208 L${rightShoulder - armWidth} 148 C${rightShoulder - armWidth - 2} 131 ${rightShoulder - armWidth - 7} 120 ${rightShoulder - 5} 112 Z`),
    path(`M${leftHip} 180 C${leftHip - 4} 201 ${leftHip - 5} 224 ${leftHip - 5} 248 L${leftHip - 6} 274 C${leftHip - 7} 284 ${leftHip + legWidth - 1} 288 ${leftHip + legWidth + 5} 282 C${leftHip + legWidth + 8} 278 ${leftHip + legWidth + 6} 264 ${leftHip + legWidth + 6} 251 L${leftHip + legWidth + 8} 187 Z`),
    path(`M${rightHip} 180 C${rightHip + 4} 201 ${rightHip + 5} 224 ${rightHip + 5} 248 L${rightHip + 6} 274 C${rightHip + 7} 284 ${rightHip - legWidth + 1} 288 ${rightHip - legWidth - 5} 282 C${rightHip - legWidth - 8} 278 ${rightHip - legWidth - 6} 264 ${rightHip - legWidth - 6} 251 L${rightHip - legWidth - 8} 187 Z`),
    path('M136 94 C136 108 132 118 126 124 L174 124 C168 118 164 108 164 94 Z'),
  ])
}

const parts: SvgPartDefinition[] = [
  part('equipment-wheelchair', 'mobilityEquipment', 'equipment', 'rear-equipment', [
    path('M96 196 C72 204 58 228 64 252 C69 276 92 291 116 286 C138 281 152 259 148 236 C144 213 120 192 96 196 Z', 'none', 7),
    path('M188 171 L207 229 L244 229', 'none', 7),
    path('M204 229 C199 260 176 279 146 281', 'none', 7),
    path('M191 171 L219 171', 'none', 7),
  ]),
  part('hair-long-rear', 'rearHair', 'hair', 'rear-hair', [
    path('M103 51 C111 25 137 18 158 21 C190 24 204 49 200 88 L205 139 C192 151 176 153 164 143 L137 143 C119 154 98 148 93 134 L101 89 C96 75 97 62 103 51 Z'),
  ]),
  part('hair-coily-rear', 'rearHair', 'hair', 'rear-hair', [
    path('M99 78 C87 65 96 47 109 44 C106 28 126 20 138 28 C148 14 169 21 172 33 C190 27 204 43 198 58 C213 68 204 88 191 91 L192 129 C181 143 167 145 156 136 L126 140 C111 140 100 130 102 116 Z'),
  ]),
  body('body-slim', 37, 17, 19, 17),
  body('body-average', 43, 20, 23, 20),
  body('body-broad', 49, 23, 28, 23),
  part('bottom-trousers', 'bottom', 'bottom', 'body-lower-clothing', [
    path('M111 174 C124 168 176 168 189 174 L187 219 L163 219 L158 184 L142 184 L137 219 L113 219 Z'),
    path('M113 212 L137 212 L134 260 L109 260 Z'),
    path('M163 212 L187 212 L191 260 L166 260 Z'),
  ]),
  part('bottom-shorts', 'bottom', 'bottom', 'body-lower-clothing', [
    path('M110 174 C126 168 174 168 190 174 L187 218 L159 218 L150 191 L141 218 L113 218 Z'),
  ]),
  part('bottom-skirt', 'bottom', 'bottom', 'body-lower-clothing', [
    path('M118 171 C132 168 168 168 182 171 L198 226 C172 235 128 235 102 226 Z'),
  ]),
  part('top-tshirt', 'top', 'top', 'upper-clothing', [
    path('M121 111 C131 106 136 105 139 104 C141 113 159 113 161 104 C171 107 179 110 187 115 L179 151 L181 183 C163 190 137 190 119 183 L121 151 L113 115 Z'),
    path('M114 115 C105 121 103 136 105 151 L124 151 L128 119 Z'),
    path('M186 115 C195 121 197 136 195 151 L176 151 L172 119 Z'),
  ]),
  part('top-jumper', 'top', 'top', 'upper-clothing', [
    path('M120 110 C131 106 137 104 140 103 C142 113 158 113 160 103 C173 107 181 110 189 117 L181 183 C162 190 138 190 119 183 L111 117 Z'),
    path('M112 116 C101 126 100 158 103 190 L124 190 L128 119 Z'),
    path('M188 116 C199 126 200 158 197 190 L176 190 L172 119 Z'),
  ]),
  part('footwear-trainers', 'footwear', 'footwear', 'front-limbs-hands', [
    path('M104 257 L136 257 L138 278 C132 287 97 287 92 280 C92 269 97 262 104 257 Z'),
    path('M164 257 L196 257 C203 262 208 269 208 280 C203 287 168 287 162 278 Z'),
  ]),
  part('footwear-boots', 'footwear', 'footwear', 'front-limbs-hands', [
    path('M102 246 L137 246 L138 279 C128 287 98 287 91 280 C92 268 96 257 102 246 Z'),
    path('M163 246 L198 246 C204 257 208 268 209 280 C202 287 172 287 162 279 Z'),
  ]),
  part('head-round', 'head', 'skin', 'head-ears', [
    path('M108 67 C108 35 126 21 151 21 C177 21 194 37 193 69 C193 99 176 118 151 119 C126 119 108 98 108 67 Z'),
    path('M109 68 C98 62 94 76 101 86 C104 90 109 89 112 85 Z'),
    path('M192 68 C203 62 207 76 200 86 C197 90 192 89 189 85 Z'),
  ]),
  part('head-oval', 'head', 'skin', 'head-ears', [
    path('M113 62 C114 34 130 20 151 20 C174 20 190 36 189 66 C188 99 174 119 151 121 C127 119 112 98 113 62 Z'),
    path('M114 68 C103 63 100 77 106 87 C109 91 113 89 116 85 Z'),
    path('M188 68 C199 63 202 77 196 87 C193 91 189 89 186 85 Z'),
  ]),
  part('face-soft', 'face', 'detail', 'face-facial-hair', [
    path('M150 68 C146 76 146 82 151 84', 'none', 3),
  ]),
  part('face-defined', 'face', 'detail', 'face-facial-hair', [
    path('M147 66 C143 75 144 82 152 85 C155 85 157 83 158 81', 'none', 3),
  ]),
  part('expression-neutral', 'actionPart', 'detail', 'face-facial-hair', [
    line(132, 62, 140, 62, 4), line(162, 62, 170, 62, 4),
    path('M139 96 C146 99 154 99 161 96', 'none', 3),
  ]),
  part('hand-left-relaxed', 'actionPart', 'skin', 'front-limbs-hands', [
    path('M101 207 C92 206 88 214 91 221 C95 229 108 230 113 222 C117 214 111 208 101 207 Z'),
  ]),
  part('hand-right-relaxed', 'actionPart', 'skin', 'front-limbs-hands', [
    path('M199 207 C208 206 212 214 209 221 C205 229 192 230 187 222 C183 214 189 208 199 207 Z'),
  ]),
  part('hair-short-front', 'frontHair', 'hair', 'front-hair-accessories', [
    path('M107 67 C103 46 114 27 135 22 C160 15 185 27 193 49 C197 60 194 72 190 79 C183 62 174 51 164 47 C151 55 134 52 121 47 C115 55 111 62 107 67 Z'),
  ]),
  part('hair-long-front', 'frontHair', 'hair', 'front-hair-accessories', [
    path('M105 70 C101 45 116 25 139 20 C166 14 190 30 195 53 C197 63 194 74 190 81 C183 62 174 51 164 47 C150 55 135 53 120 47 C115 56 111 64 105 70 Z'),
    path('M105 67 C99 91 98 115 102 137 C110 143 117 140 121 133 L120 48 Z'),
    path('M193 65 C200 89 201 113 197 137 C189 143 182 140 178 133 L180 48 Z'),
  ]),
  part('hair-coily-front', 'frontHair', 'hair', 'front-hair-accessories', [
    path('M102 72 C92 65 96 51 106 48 C101 36 113 25 125 30 C130 17 145 16 153 26 C164 15 179 23 179 35 C193 32 202 45 196 57 C208 65 200 81 189 82 C181 64 173 54 163 49 C150 55 135 53 122 48 C115 54 109 62 102 72 Z'),
  ]),
  part('glasses-round', 'glasses', 'detail', 'front-hair-accessories', [
    { element: 'circle', attributes: { cx: 136, cy: 66, r: 12, fill: 'none', stroke: 'currentColor', 'stroke-width': 4 } },
    { element: 'circle', attributes: { cx: 166, cy: 66, r: 12, fill: 'none', stroke: 'currentColor', 'stroke-width': 4 } },
    line(148, 66, 154, 66, 4), line(123, 64, 110, 60, 4), line(179, 64, 191, 60, 4),
  ]),
  part('glasses-rectangular', 'glasses', 'detail', 'front-hair-accessories', [
    path('M121 55 L148 56 L147 77 L122 76 Z', 'none', 4),
    path('M154 56 L181 55 L180 76 L155 77 Z', 'none', 4),
    line(148, 64, 154, 64, 4), line(121, 60, 110, 58, 4), line(181, 60, 192, 58, 4),
  ]),
  part('hearing-left', 'hearingDevice', 'equipment', 'front-hair-accessories', [
    path('M103 68 C94 72 95 91 105 94 L111 85 C105 82 105 76 110 73', 'none', 5),
  ]),
  part('hearing-right', 'hearingDevice', 'equipment', 'front-hair-accessories', [
    path('M197 68 C206 72 205 91 195 94 L189 85 C195 82 195 76 190 73', 'none', 5),
  ]),
]

export const developmentArtKit: AvatarArtKitManifest = {
  version: 1,
  status: 'development',
  palettes: [
    { id: 'skin-light', label: 'Light', role: 'skin', value: '#f1c7ad' },
    { id: 'skin-medium', label: 'Medium', role: 'skin', value: '#c88b6c' },
    { id: 'skin-deep', label: 'Deep', role: 'skin', value: '#744632' },
    { id: 'hair-dark', label: 'Dark brown', role: 'hair', value: '#211111' },
    { id: 'hair-auburn', label: 'Auburn', role: 'hair', value: '#7c3524' },
    { id: 'hair-gold', label: 'Golden', role: 'hair', value: '#c18a3d' },
    { id: 'top-purple', label: 'Purple', role: 'top', value: '#af76ed' },
    { id: 'top-blue', label: 'Blue', role: 'top', value: '#4786c6' },
    { id: 'top-green', label: 'Green', role: 'top', value: '#599c69' },
    { id: 'bottom-blue', label: 'Denim blue', role: 'bottom', value: '#315ea8' },
    { id: 'bottom-charcoal', label: 'Charcoal', role: 'bottom', value: '#4b4b55' },
    { id: 'footwear-dark', label: 'Dark', role: 'footwear', value: '#292526' },
    { id: 'footwear-white', label: 'White', role: 'footwear', value: '#f7f4ee' },
    { id: 'detail-dark', label: 'Dark detail', role: 'detail', value: outline },
    { id: 'equipment-blue', label: 'Equipment blue', role: 'equipment', value: '#397a9f' },
  ],
  parts,
  actions: [{
    id: 'neutral',
    label: 'Neutral',
    placements: [],
    expressionParts: { neutral: 'expression-neutral' },
    leftHandParts: { relaxed: 'hand-left-relaxed' },
    rightHandParts: { relaxed: 'hand-right-relaxed' },
  }],
}

export const developmentDefaultIdentity: CharacterIdentityV1 = {
  version: 1,
  artKitVersion: 1,
  selections: {
    body: 'body-average',
    head: 'head-round',
    face: 'face-soft',
    rearHair: null,
    frontHair: 'hair-short-front',
    top: 'top-tshirt',
    bottom: 'bottom-trousers',
    footwear: 'footwear-trainers',
    glasses: null,
    mobilityEquipment: null,
  },
  colours: {
    skin: 'skin-medium',
    hair: 'hair-dark',
    top: 'top-purple',
    bottom: 'bottom-blue',
    footwear: 'footwear-dark',
  },
  sidedSelections: { hearingDevice: null, arm: null, leg: null },
}

export const developmentNeutralAction: CharacterActionV1 = {
  version: 1,
  actionId: 'neutral',
  expressionId: 'neutral',
  leftHandId: 'relaxed',
  rightHandId: 'relaxed',
  propId: null,
  equipmentOverrideId: null,
  mirrored: false,
}
