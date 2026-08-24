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

export interface CharacterApiWriteV1 {
  name: string
  template_key: 'modular-svg-avatar'
  template_version: 1
  configuration_version: 1
  identity: CharacterIdentityV1
  revision?: number
}

export interface CharacterApiRecordV1 extends Omit<CharacterApiWriteV1, 'revision'> {
  id: string
  revision: number
  created_at: string
  updated_at: string
}

export interface CharacterSymbolApiWriteV1 {
  name: string
  configuration_version: 1
  action: CharacterActionV1
  revision?: number
}

export interface CharacterSymbolApiRecordV1 extends Omit<CharacterSymbolApiWriteV1, 'revision'> {
  id: string
  character_id: string
  revision: number
  created_at: string
  updated_at: string
}

export type CharacterApiErrorCode =
  | 'authentication_unconfigured'
  | 'authentication_required'
  | 'database_unavailable'
  | 'account_deleted'
  | 'invalid_character'
  | 'invalid_character_symbol'
  | 'unsupported_avatar_selection'
  | 'avatar_art_unavailable'
  | 'character_conflict'
  | 'character_symbol_conflict'
  | 'character_has_symbols'
  | 'not_found'

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

export interface EquipmentCompositionDefinition {
  equipmentPartId: PartId
  replacements: Partial<Record<IdentitySlotId, Readonly<Record<PartId, PartId>>>>
  placements?: readonly PartPlacement[]
  leftHandTransform?: string
  rightHandTransform?: string
}

export interface PartCompositionDefinition {
  triggerPartId: PartId
  placements: readonly PartPlacement[]
}

export interface PaletteDefinition {
  id: PaletteId
  label: string
  role: ColourRole
  value: string
}

export interface AvatarArtKitManifest {
  version: number
  status: 'pending' | 'development' | 'approved'
  palettes: readonly PaletteDefinition[]
  parts: readonly SvgPartDefinition[]
  actions: readonly AvatarActionDefinition[]
  equipmentCompositions?: readonly EquipmentCompositionDefinition[]
  partCompositions?: readonly PartCompositionDefinition[]
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
