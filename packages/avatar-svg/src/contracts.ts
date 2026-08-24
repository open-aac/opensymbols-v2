export const AVATAR_VIEW_BOX = { x: 0, y: 0, width: 300, height: 300 } as const

export const AVATAR_LAYERS = [
  'rear-equipment',
  'rear-hair',
  'rear-limbs',
  'body-lower-clothing',
  'upper-clothing',
  'front-limbs-hands',
  'props',
  'head-ears',
  'face-facial-hair',
  'front-hair-accessories',
  'foreground-equipment',
] as const

export type AvatarLayer = (typeof AVATAR_LAYERS)[number]
export type PartId = string
export type PaletteId = string
export type ActionTemplateId = string
export type ExpressionId = string
export type HandPartId = string
export type PropId = string
export type EquipmentId = string

export const IDENTITY_SLOTS = [
  'body', 'head', 'face', 'rearHair', 'frontHair', 'facialHair', 'top', 'bottom',
  'footwear', 'headwear', 'glasses', 'hearingDevice', 'mobilityEquipment',
] as const

export type IdentitySlotId = (typeof IDENTITY_SLOTS)[number]

export type ColourRole =
  | 'skin'
  | 'hair'
  | 'top'
  | 'bottom'
  | 'footwear'
  | 'outline'
  | 'detail'
  | 'equipment'

export interface SidedPartSelection {
  left: PartId | null
  right: PartId | null
}

export interface CharacterIdentityV1 {
  version: 1
  artKitVersion: number
  selections: Partial<Record<IdentitySlotId, PartId | null>>
  colours: {
    skin: PaletteId
    hair: PaletteId
    top: PaletteId
    bottom: PaletteId
    footwear: PaletteId
  }
  sidedSelections: {
    hearingDevice: SidedPartSelection | null
    arm: SidedPartSelection | null
    leg: SidedPartSelection | null
  }
}

export interface CharacterActionV1 {
  version: 1
  actionId: ActionTemplateId
  expressionId: ExpressionId
  leftHandId: HandPartId
  rightHandId: HandPartId
  propId: PropId | null
  equipmentOverrideId: EquipmentId | null
  mirrored: boolean
}

export interface SvgBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface PartConnector {
  id: string
  connectorClass: string
  x: number
  y: number
  directionDegrees: number
  seamWidth: number
  overlap: number
}

export type SvgElementName =
  | 'g'
  | 'path'
  | 'circle'
  | 'ellipse'
  | 'rect'
  | 'line'
  | 'polyline'
  | 'polygon'

export type SvgAttributeValue = string | number

export interface CompiledSvgNode {
  element: SvgElementName
  attributes: Record<string, SvgAttributeValue>
  children?: readonly CompiledSvgNode[]
}

export interface PartCompatibility {
  partIds?: readonly PartId[]
  actionIds?: readonly ActionTemplateId[]
}

export interface SvgPartDefinition {
  id: PartId
  slot: IdentitySlotId | 'actionPart'
  colourRole: ColourRole
  layer: AvatarLayer
  bounds: SvgBounds
  connectors: readonly PartConnector[]
  compatibility?: PartCompatibility
  nodes: readonly CompiledSvgNode[]
}

export interface PartPlacement {
  partId: PartId
  transform?: string
}

export interface AvatarActionDefinition {
  id: ActionTemplateId
  label: string
  placements: readonly PartPlacement[]
  identityTransforms?: Partial<Record<IdentitySlotId, string>>
  expressionParts: Readonly<Record<ExpressionId, PartId>>
  leftHandParts: Readonly<Record<HandPartId, PartId>>
  rightHandParts: Readonly<Record<HandPartId, PartId>>
  propParts?: Readonly<Record<PropId, PartId>>
  equipmentParts?: Readonly<Record<EquipmentId, PartId>>
}

export interface PaletteDefinition {
  id: PaletteId
  label: string
  role: ColourRole
  value: string
}

export interface AvatarArtKitManifest {
  version: number
  status: 'pending' | 'approved'
  palettes: readonly PaletteDefinition[]
  parts: readonly SvgPartDefinition[]
  actions: readonly AvatarActionDefinition[]
}

export interface ValidationIssue {
  code: string
  path: string
  message: string
}

export type AvatarUnavailableCode =
  | 'art_kit_pending'
  | 'art_kit_version_mismatch'
  | 'action_missing'
  | 'part_missing'
  | 'palette_missing'

export interface ResolvedPart {
  part: SvgPartDefinition
  colour: string
  transform?: string
}

export type AvatarResolution =
  | { kind: 'ready'; parts: readonly ResolvedPart[]; mirrored: boolean }
  | { kind: 'unavailable'; code: AvatarUnavailableCode; message: string; missingIds?: readonly string[] }
