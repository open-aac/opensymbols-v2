import type {
  AvatarArtKitManifest,
  CharacterActionV1,
  CharacterIdentityV1,
  CompiledSvgNode,
  IdentitySlotId,
  SvgPartDefinition,
} from './contracts.js'

const outline = '#302827'

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

function circle(cx: number, cy: number, r: number, fill = 'none', strokeWidth = 6): CompiledSvgNode {
  return {
    element: 'circle',
    attributes: { cx, cy, r, fill, stroke: outline, 'stroke-width': strokeWidth },
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
    bounds: { x: 6, y: 6, width: 288, height: 288 },
    connectors: [],
    nodes,
  }
}

function standingBody(id: string, shoulder: number, armWidth: number, hip: number): SvgPartDefinition {
  const leftShoulder = 150 - shoulder
  const rightShoulder = 150 + shoulder
  const leftHip = 150 - hip
  const rightHip = 150 + hip
  return part(id, 'body', 'skin', 'body-lower-clothing', [
    path(`M${leftShoulder + 8} 111 C${leftShoulder - 5} 113 ${leftShoulder - 13} 127 ${leftShoulder - 14} 143 L${leftShoulder - 15} 157 C${leftShoulder - 11} 164 ${leftShoulder - 2} 166 ${leftShoulder + 4} 160 L${leftShoulder + 7} 144 C${leftShoulder + 9} 130 ${leftShoulder + armWidth} 117 ${leftShoulder + 8} 111 Z`),
    path(`M${leftShoulder - 15} 153 C${leftShoulder - 20} 168 ${leftShoulder - 21} 184 ${leftShoulder - 21} 197 C${leftShoulder - 21} 205 ${leftShoulder - 14} 210 ${leftShoulder - 7} 207 C${leftShoulder - 1} 204 ${leftShoulder - 1} 198 ${leftShoulder - 2} 192 L${leftShoulder + 4} 160 C${leftShoulder} 153 ${leftShoulder - 8} 151 ${leftShoulder - 15} 153 Z`),
    path(`M${rightShoulder - 8} 111 C${rightShoulder + 5} 113 ${rightShoulder + 13} 127 ${rightShoulder + 14} 143 L${rightShoulder + 15} 157 C${rightShoulder + 11} 164 ${rightShoulder + 2} 166 ${rightShoulder - 4} 160 L${rightShoulder - 7} 144 C${rightShoulder - 9} 130 ${rightShoulder - armWidth} 117 ${rightShoulder - 8} 111 Z`),
    path(`M${rightShoulder + 15} 153 C${rightShoulder + 20} 168 ${rightShoulder + 21} 184 ${rightShoulder + 21} 197 C${rightShoulder + 21} 205 ${rightShoulder + 14} 210 ${rightShoulder + 7} 207 C${rightShoulder + 1} 204 ${rightShoulder + 1} 198 ${rightShoulder + 2} 192 L${rightShoulder - 4} 160 C${rightShoulder} 153 ${rightShoulder + 8} 151 ${rightShoulder + 15} 153 Z`),
    path(`M${leftHip - 8} 178 C${leftHip - 11} 202 ${leftHip - 10} 231 ${leftHip - 7} 263 L${leftHip + 17} 263 C${leftHip + 19} 231 ${leftHip + 18} 203 ${leftHip + 12} 180 Z`),
    path(`M${rightHip + 8} 178 C${rightHip + 11} 202 ${rightHip + 10} 231 ${rightHip + 7} 263 L${rightHip - 17} 263 C${rightHip - 19} 231 ${rightHip - 18} 203 ${rightHip - 12} 180 Z`),
    path('M137 94 C138 105 134 112 128 117 L172 117 C166 112 162 105 163 94 Z'),
  ])
}

function seatedBody(id: string, shoulder: number, armWidth: number, hip: number): SvgPartDefinition {
  const leftShoulder = 150 - shoulder
  const rightShoulder = 150 + shoulder
  const leftHip = 150 - hip
  const rightHip = 150 + hip
  return part(id, 'actionPart', 'skin', 'body-lower-clothing', [
    path(`M${leftShoulder + 8} 111 C${leftShoulder - 5} 113 ${leftShoulder - 13} 127 ${leftShoulder - 14} 143 L${leftShoulder - 15} 157 C${leftShoulder - 11} 164 ${leftShoulder - 2} 166 ${leftShoulder + 4} 160 L${leftShoulder + 7} 144 C${leftShoulder + 9} 130 ${leftShoulder + armWidth} 117 ${leftShoulder + 8} 111 Z`),
    path(`M${leftShoulder - 15} 153 C${leftShoulder - 14} 168 ${leftShoulder - 2} 185 118 200 C123 204 130 200 131 193 C121 176 ${leftShoulder + 4} 159 ${leftShoulder + 4} 159 C${leftShoulder} 153 ${leftShoulder - 8} 151 ${leftShoulder - 15} 153 Z`),
    path(`M${rightShoulder - 8} 111 C${rightShoulder + 5} 113 ${rightShoulder + 13} 127 ${rightShoulder + 14} 143 L${rightShoulder + 15} 157 C${rightShoulder + 11} 164 ${rightShoulder + 2} 166 ${rightShoulder - 4} 160 L${rightShoulder - 7} 144 C${rightShoulder - 9} 130 ${rightShoulder - armWidth} 117 ${rightShoulder - 8} 111 Z`),
    path(`M${rightShoulder + 15} 153 C${rightShoulder + 14} 168 ${rightShoulder + 2} 185 182 200 C177 204 170 200 169 193 C179 176 ${rightShoulder - 4} 159 ${rightShoulder - 4} 159 C${rightShoulder} 153 ${rightShoulder + 8} 151 ${rightShoulder + 15} 153 Z`),
    path(`M${leftHip - 8} 178 C${leftHip - 18} 190 108 206 102 221 C111 229 119 234 128 236 C137 224 143 207 145 186 Z`),
    path('M102 220 C105 234 114 248 123 264 L145 257 C139 239 130 225 120 215 Z'),
    path(`M${rightHip + 8} 178 C${rightHip + 18} 190 192 206 198 221 C189 229 181 234 172 236 C163 224 157 207 155 186 Z`),
    path('M198 220 C195 234 186 248 177 264 L155 257 C161 239 170 225 180 215 Z'),
    path('M137 94 C138 105 134 112 128 117 L172 117 C166 112 162 105 163 94 Z'),
  ])
}

function seatedTop(id: string, jumper: boolean): SvgPartDefinition {
  return part(id, 'actionPart', 'top', 'upper-clothing', jumper ? [
    path('M120 110 C132 106 138 104 140 103 C143 112 157 112 160 103 C172 106 181 111 188 118 L181 183 C163 190 137 190 119 183 L112 118 Z'),
    path('M113 117 C103 128 103 151 111 169 L128 160 L128 119 Z'),
    path('M187 117 C197 128 197 151 189 169 L172 160 L172 119 Z'),
  ] : [
    path('M121 111 C132 107 137 105 140 104 C143 112 157 112 160 104 C171 107 179 111 187 116 L180 151 L181 183 C163 190 137 190 119 183 L120 151 L113 116 Z'),
    path('M114 116 C106 122 105 135 107 148 L126 148 L128 119 Z'),
    path('M186 116 C194 122 195 135 193 148 L174 148 L172 119 Z'),
  ])
}

const parts: SvgPartDefinition[] = [
  part('equipment-wheelchair', 'mobilityEquipment', 'equipment', 'rear-equipment', [
    circle(100, 222, 57, 'none', 7),
    circle(200, 222, 57, 'none', 7),
    path('M112 121 L188 121 L190 206 C174 216 126 216 110 206 Z'),
    path('M110 184 L190 184', 'none', 7),
  ]),
  part('equipment-wheelchair-front', 'actionPart', 'equipment', 'foreground-equipment', [
    circle(100, 222, 8, 'currentColor', 4),
    circle(200, 222, 8, 'currentColor', 4),
  ]),
  part('hair-long-rear', 'rearHair', 'hair', 'rear-hair', [
    path('M106 57 C112 30 131 19 153 20 C181 20 197 40 195 70 L202 132 C194 143 181 147 169 139 L132 139 C119 147 104 142 98 132 L105 72 C102 67 103 62 106 57 Z'),
  ]),
  part('hair-coily-rear', 'rearHair', 'hair', 'rear-hair', [
    path('M103 80 C90 72 94 55 105 50 C99 36 112 24 125 29 C131 16 147 16 155 27 C166 17 181 25 181 38 C195 35 204 49 198 61 C210 71 202 86 190 88 L195 126 C184 140 169 143 157 135 L126 139 C111 139 101 128 103 114 Z'),
  ]),
  standingBody('body-slim', 38, 17, 20),
  standingBody('body-average', 43, 20, 24),
  standingBody('body-broad', 49, 23, 29),
  seatedBody('body-slim-seated', 38, 17, 20),
  seatedBody('body-average-seated', 43, 20, 24),
  seatedBody('body-broad-seated', 49, 23, 29),
  part('bottom-trousers', 'bottom', 'bottom', 'body-lower-clothing', [
    path('M111 174 C126 169 174 169 189 174 L186 263 L156 263 L153 190 L147 190 L144 263 L114 263 Z'),
  ]),
  part('bottom-shorts', 'bottom', 'bottom', 'body-lower-clothing', [
    path('M111 174 C126 169 174 169 189 174 L186 213 L158 213 L150 190 L142 213 L114 213 Z'),
  ]),
  part('bottom-skirt', 'bottom', 'bottom', 'body-lower-clothing', [
    path('M119 171 C133 168 167 168 181 171 L195 224 C171 231 129 231 105 224 Z'),
  ]),
  part('bottom-trousers-seated', 'actionPart', 'bottom', 'body-lower-clothing', [
    path('M111 174 C126 169 174 169 189 174 C189 189 194 207 200 220 L177 236 C164 218 156 202 150 190 C144 202 136 218 123 236 L100 220 C106 207 111 189 111 174 Z'),
    path('M100 219 C106 237 114 250 123 265 L147 257 C141 239 131 224 121 214 Z'),
    path('M200 219 C194 237 186 250 177 265 L153 257 C159 239 169 224 179 214 Z'),
  ]),
  part('bottom-shorts-seated', 'actionPart', 'bottom', 'body-lower-clothing', [
    path('M111 174 C126 169 174 169 189 174 C190 187 194 200 198 211 L177 223 C165 210 157 198 150 188 C143 198 135 210 123 223 L102 211 C106 200 110 187 111 174 Z'),
  ]),
  part('bottom-skirt-seated', 'actionPart', 'bottom', 'body-lower-clothing', [
    path('M116 171 C132 168 168 168 184 171 L207 218 C177 232 123 232 93 218 Z'),
  ]),
  part('top-tshirt', 'top', 'top', 'upper-clothing', [
    path('M121 111 C132 107 137 105 140 104 C143 112 157 112 160 104 C171 107 179 111 187 116 L180 151 L181 183 C163 190 137 190 119 183 L120 151 L113 116 Z'),
    path('M114 116 C106 122 104 136 106 150 L126 150 L128 119 Z'),
    path('M186 116 C194 122 196 136 194 150 L174 150 L172 119 Z'),
  ]),
  part('top-jumper', 'top', 'top', 'upper-clothing', [
    path('M120 110 C132 106 138 104 140 103 C143 112 157 112 160 103 C172 106 181 111 188 118 L181 183 C163 190 137 190 119 183 L112 118 Z'),
    path('M113 117 C103 128 102 157 105 188 L126 188 L128 119 Z'),
    path('M187 117 C197 128 198 157 195 188 L174 188 L172 119 Z'),
  ]),
  seatedTop('top-tshirt-seated', false),
  seatedTop('top-jumper-seated', true),
  part('footwear-trainers', 'footwear', 'footwear', 'front-limbs-hands', [
    path('M111 255 L144 255 L145 276 C137 284 105 284 99 278 C100 267 104 260 111 255 Z'),
    path('M156 255 L189 255 C196 260 200 267 201 278 C195 284 163 284 155 276 Z'),
  ]),
  part('footwear-boots', 'footwear', 'footwear', 'front-limbs-hands', [
    path('M108 244 L144 244 L145 277 C136 285 104 285 98 278 C99 264 103 253 108 244 Z'),
    path('M156 244 L192 244 C197 253 201 264 202 278 C196 285 164 285 155 277 Z'),
  ]),
  part('footwear-trainers-seated', 'actionPart', 'footwear', 'front-limbs-hands', [
    path('M116 251 L145 251 L147 270 C140 278 110 278 104 272 C105 262 110 256 116 251 Z'),
    path('M155 251 L184 251 C190 256 195 262 196 272 C190 278 160 278 153 270 Z'),
  ]),
  part('footwear-boots-seated', 'actionPart', 'footwear', 'front-limbs-hands', [
    path('M113 241 L145 241 L147 271 C139 279 109 279 103 272 C104 259 108 249 113 241 Z'),
    path('M155 241 L187 241 C192 249 196 259 197 272 C191 279 161 279 153 271 Z'),
  ]),
  part('head-round', 'head', 'skin', 'head-ears', [
    path('M108 67 C108 37 126 22 150 22 C175 22 192 38 192 68 C192 98 175 116 150 117 C126 116 108 97 108 67 Z'),
    path('M109 69 C99 64 96 76 102 85 C105 89 109 88 112 84 Z'),
    path('M191 69 C201 64 204 76 198 85 C195 89 191 88 188 84 Z'),
  ]),
  part('head-oval', 'head', 'skin', 'head-ears', [
    path('M113 64 C113 35 129 20 150 20 C173 20 189 36 188 67 C187 99 173 118 150 120 C127 118 112 98 113 64 Z'),
    path('M114 70 C104 65 101 77 107 86 C110 90 114 89 117 85 Z'),
    path('M187 70 C197 65 200 77 194 86 C191 90 187 89 184 85 Z'),
  ]),
  part('face-soft', 'face', 'detail', 'face-facial-hair', [
    path('M148 67 C144 75 145 82 151 84', 'none', 3),
  ]),
  part('face-defined', 'face', 'detail', 'face-facial-hair', [
    path('M146 65 C142 74 143 82 151 85 C155 85 158 82 159 79', 'none', 3),
  ]),
  part('expression-neutral', 'actionPart', 'detail', 'face-facial-hair', [
    path('M130 63 C134 60 139 60 143 63', 'none', 4),
    path('M158 63 C162 60 167 60 171 63', 'none', 4),
    path('M138 96 C145 100 155 100 162 96', 'none', 3),
  ]),
  part('hand-left-relaxed', 'actionPart', 'skin', 'front-limbs-hands', [
    path('M96 198 C88 199 85 207 89 214 C93 221 104 222 109 215 C113 208 107 199 96 198 Z'),
  ]),
  part('hand-right-relaxed', 'actionPart', 'skin', 'front-limbs-hands', [
    path('M204 198 C212 199 215 207 211 214 C207 221 196 222 191 215 C187 208 193 199 204 198 Z'),
  ]),
  part('hair-short-front', 'frontHair', 'hair', 'front-hair-accessories', [
    path('M107 67 C103 48 112 31 129 24 C149 15 174 22 187 39 C196 51 196 67 190 78 C183 61 174 51 164 47 C151 54 135 53 121 47 C115 54 111 61 107 67 Z'),
  ]),
  part('hair-long-front', 'frontHair', 'hair', 'front-hair-accessories', [
    path('M106 69 C102 46 115 28 136 22 C162 15 187 29 194 51 C197 62 194 74 190 81 C183 62 174 51 164 47 C150 54 135 53 120 47 C115 55 111 63 106 69 Z'),
    path('M107 64 C101 86 101 112 105 132 C111 137 117 135 120 128 L120 48 Z'),
    path('M191 63 C198 85 198 111 195 132 C189 137 183 135 180 128 L180 48 Z'),
  ]),
  part('hair-coily-front', 'frontHair', 'hair', 'front-hair-accessories', [
    path('M103 72 C93 65 97 52 107 48 C102 37 113 26 125 30 C131 18 145 17 153 27 C164 17 178 24 179 36 C192 33 201 46 196 58 C207 66 200 80 189 82 C181 64 173 54 163 49 C150 55 136 53 122 48 C115 54 109 62 103 72 Z'),
  ]),
  part('glasses-round', 'glasses', 'detail', 'front-hair-accessories', [
    circle(136, 67, 12, 'none', 4), circle(165, 67, 12, 'none', 4),
    line(148, 67, 153, 67, 4), line(124, 65, 111, 61, 4), line(177, 65, 190, 61, 4),
  ]),
  part('glasses-rectangular', 'glasses', 'detail', 'front-hair-accessories', [
    path('M121 56 L148 57 L147 77 L122 76 Z', 'none', 4),
    path('M153 57 L180 56 L179 76 L154 77 Z', 'none', 4),
    line(148, 65, 153, 65, 4), line(121, 61, 110, 59, 4), line(180, 61, 191, 59, 4),
  ]),
  part('hearing-left', 'hearingDevice', 'equipment', 'front-hair-accessories', [
    path('M104 69 C96 72 96 89 105 93 L111 85 C106 82 106 76 111 73', 'none', 5),
  ]),
  part('hearing-right', 'hearingDevice', 'equipment', 'front-hair-accessories', [
    path('M196 69 C204 72 204 89 195 93 L189 85 C194 82 194 76 189 73', 'none', 5),
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
  equipmentCompositions: [{
    equipmentPartId: 'equipment-wheelchair',
    replacements: {
      body: {
        'body-slim': 'body-slim-seated',
        'body-average': 'body-average-seated',
        'body-broad': 'body-broad-seated',
      },
      top: {
        'top-tshirt': 'top-tshirt-seated',
        'top-jumper': 'top-jumper-seated',
      },
      bottom: {
        'bottom-trousers': 'bottom-trousers-seated',
        'bottom-shorts': 'bottom-shorts-seated',
        'bottom-skirt': 'bottom-skirt-seated',
      },
      footwear: {
        'footwear-trainers': 'footwear-trainers-seated',
        'footwear-boots': 'footwear-boots-seated',
      },
    },
    placements: [{ partId: 'equipment-wheelchair-front' }],
    leftHandTransform: 'translate(21 -8)',
    rightHandTransform: 'translate(-21 -8)',
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
