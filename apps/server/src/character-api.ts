import type {
  AvatarArtKitManifest,
  CharacterApiRecordV1,
  CharacterActionV1,
  CharacterIdentityV1,
  CharacterSymbolApiRecordV1,
  ColourRole,
  IdentitySlotId,
  SidedPartSelection,
} from '@opensymbols/avatar-svg/contracts'
import type {
  CharacterRecord,
  CharacterSymbolRecord,
  CharacterSymbolWrite,
  CharacterWrite,
} from './character-store.js'

export const CHARACTER_TEMPLATE_KEY = 'modular-svg-avatar'
export const CHARACTER_TEMPLATE_VERSION = 1
export const CHARACTER_CONFIGURATION_VERSION = 1
export const CHARACTER_SYMBOL_CONFIGURATION_VERSION = 1
export const CHARACTER_NAME_MAX_LENGTH = 80
export const CHARACTER_SYMBOL_NAME_MAX_LENGTH = 80

export type AvatarWriteError = 'invalid_character' | 'invalid_character_symbol' | 'avatar_art_unavailable' | 'unsupported_avatar_selection'
export type ParseResult<Value> = { kind: 'ok'; value: Value } | { kind: 'error'; error: AvatarWriteError }

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const identitySlots = new Set<IdentitySlotId>([
  'body', 'head', 'face', 'rearHair', 'frontHair', 'facialHair', 'top', 'bottom',
  'footwear', 'headwear', 'glasses', 'hearingDevice', 'mobilityEquipment',
])
const requiredIdentitySlots: readonly IdentitySlotId[] = ['body', 'head', 'face', 'top', 'bottom', 'footwear']

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && !Array.isArray(value) && typeof value === 'object'
    ? value as Record<string, unknown>
    : null
}

function name(value: unknown, maximum: number): string | null {
  const result = typeof value === 'string' ? value.trim() : ''
  return result && result.length <= maximum ? result : null
}

function sidedSelection(value: unknown): SidedPartSelection | null | undefined {
  if (value === null) return null
  const input = object(value)
  if (!input || !['string', 'object'].includes(typeof input.left) || !['string', 'object'].includes(typeof input.right)) return undefined
  if (input.left !== null && typeof input.left !== 'string') return undefined
  if (input.right !== null && typeof input.right !== 'string') return undefined
  return { left: input.left, right: input.right } as SidedPartSelection
}

function parseIdentity(value: unknown, artKit: AvatarArtKitManifest): ParseResult<CharacterIdentityV1> {
  if (artKit.status !== 'approved') return { kind: 'error', error: 'avatar_art_unavailable' }
  const input = object(value)
  const selections = object(input?.selections)
  const colours = object(input?.colours)
  const sided = object(input?.sidedSelections)
  if (!input || !selections || !colours || !sided || input.version !== 1 || input.artKitVersion !== artKit.version) {
    return { kind: 'error', error: 'invalid_character' }
  }

  const partMap = new Map(artKit.parts.map((part) => [part.id, part]))
  const selectedIds: string[] = []
  if (requiredIdentitySlots.some((slot) => typeof selections[slot] !== 'string')) {
    return { kind: 'error', error: 'invalid_character' }
  }
  for (const [slot, partId] of Object.entries(selections)) {
    if (!identitySlots.has(slot as IdentitySlotId) || (partId !== null && typeof partId !== 'string')) {
      return { kind: 'error', error: 'invalid_character' }
    }
    if (typeof partId === 'string') {
      const part = partMap.get(partId)
      if (!part || part.slot !== slot) return { kind: 'error', error: 'unsupported_avatar_selection' }
      selectedIds.push(partId)
    }
  }

  const hearingDevice = sidedSelection(sided.hearingDevice)
  const arm = sidedSelection(sided.arm)
  const leg = sidedSelection(sided.leg)
  if (hearingDevice === undefined || arm === undefined || leg === undefined) return { kind: 'error', error: 'invalid_character' }
  for (const [selection, expectedSlot] of [
    [hearingDevice, 'hearingDevice'], [arm, 'actionPart'], [leg, 'actionPart'],
  ] as const) {
    for (const partId of selection ? [selection.left, selection.right] : []) {
      if (partId && partMap.get(partId)?.slot !== expectedSlot) return { kind: 'error', error: 'unsupported_avatar_selection' }
      if (partId) selectedIds.push(partId)
    }
  }

  const colourRoles: Array<[keyof CharacterIdentityV1['colours'], ColourRole]> = [
    ['skin', 'skin'], ['hair', 'hair'], ['top', 'top'], ['bottom', 'bottom'], ['footwear', 'footwear'],
  ]
  for (const [key, role] of colourRoles) {
    const paletteId = colours[key]
    if (typeof paletteId !== 'string') return { kind: 'error', error: 'invalid_character' }
    if (!artKit.palettes.some((palette) => palette.id === paletteId && palette.role === role)) {
      return { kind: 'error', error: 'unsupported_avatar_selection' }
    }
  }
  for (const partId of selectedIds) {
    const compatible = partMap.get(partId)?.compatibility?.partIds
    if (compatible?.length && !selectedIds.some((candidate) => candidate !== partId && compatible.includes(candidate))) {
      return { kind: 'error', error: 'unsupported_avatar_selection' }
    }
  }

  return {
    kind: 'ok',
    value: {
      version: 1,
      artKitVersion: artKit.version,
      selections: selections as CharacterIdentityV1['selections'],
      colours: {
        skin: colours.skin as string,
        hair: colours.hair as string,
        top: colours.top as string,
        bottom: colours.bottom as string,
        footwear: colours.footwear as string,
      },
      sidedSelections: { hearingDevice, arm, leg },
    },
  }
}

function parseAction(value: unknown, artKit: AvatarArtKitManifest): ParseResult<CharacterActionV1> {
  if (artKit.status !== 'approved') return { kind: 'error', error: 'avatar_art_unavailable' }
  const input = object(value)
  if (!input || input.version !== 1 || typeof input.actionId !== 'string' || typeof input.expressionId !== 'string' ||
      typeof input.leftHandId !== 'string' || typeof input.rightHandId !== 'string' || typeof input.mirrored !== 'boolean' ||
      (input.propId !== null && typeof input.propId !== 'string') ||
      (input.equipmentOverrideId !== null && typeof input.equipmentOverrideId !== 'string')) {
    return { kind: 'error', error: 'invalid_character_symbol' }
  }
  const action = artKit.actions.find((candidate) => candidate.id === input.actionId)
  if (!action || !action.expressionParts[input.expressionId] || !action.leftHandParts[input.leftHandId] ||
      !action.rightHandParts[input.rightHandId] ||
      (input.propId && !action.propParts?.[input.propId]) ||
      (input.equipmentOverrideId && !action.equipmentParts?.[input.equipmentOverrideId])) {
    return { kind: 'error', error: 'unsupported_avatar_selection' }
  }
  return {
    kind: 'ok',
    value: {
      version: 1,
      actionId: input.actionId,
      expressionId: input.expressionId,
      leftHandId: input.leftHandId,
      rightHandId: input.rightHandId,
      propId: input.propId,
      equipmentOverrideId: input.equipmentOverrideId,
      mirrored: input.mirrored,
    } as CharacterActionV1,
  }
}

export function parseCharacterWrite(value: unknown, artKit: AvatarArtKitManifest): ParseResult<CharacterWrite> {
  const input = object(value)
  const characterName = name(input?.name, CHARACTER_NAME_MAX_LENGTH)
  if (!input || !characterName || input.template_key !== CHARACTER_TEMPLATE_KEY ||
      input.template_version !== CHARACTER_TEMPLATE_VERSION || input.configuration_version !== CHARACTER_CONFIGURATION_VERSION) {
    return { kind: 'error', error: 'invalid_character' }
  }
  const identity = parseIdentity(input.identity, artKit)
  if (identity.kind === 'error') return identity
  return {
    kind: 'ok',
    value: {
      name: characterName,
      templateKey: CHARACTER_TEMPLATE_KEY,
      templateVersion: CHARACTER_TEMPLATE_VERSION,
      configurationVersion: CHARACTER_CONFIGURATION_VERSION,
      identity: identity.value,
    },
  }
}

export function parseCharacterSymbolWrite(value: unknown, artKit: AvatarArtKitManifest): ParseResult<CharacterSymbolWrite> {
  const input = object(value)
  const symbolName = name(input?.name, CHARACTER_SYMBOL_NAME_MAX_LENGTH)
  if (!input || !symbolName || input.configuration_version !== CHARACTER_SYMBOL_CONFIGURATION_VERSION) {
    return { kind: 'error', error: 'invalid_character_symbol' }
  }
  const action = parseAction(input.action, artKit)
  if (action.kind === 'error') return action
  return { kind: 'ok', value: { name: symbolName, configurationVersion: 1, action: action.value } }
}

export function parseRevision(value: unknown): number | null {
  const input = object(value)
  return Number.isInteger(input?.revision) && Number(input?.revision) > 0 ? Number(input?.revision) : null
}

export function isCharacterId(value: string): boolean {
  return uuid.test(value)
}

export function characterResponse(character: CharacterRecord): CharacterApiRecordV1 {
  return {
    id: character.id,
    name: character.name,
    template_key: character.templateKey,
    template_version: character.templateVersion,
    configuration_version: character.configurationVersion,
    identity: character.identity,
    revision: character.revision,
    created_at: character.createdAt,
    updated_at: character.updatedAt,
  }
}

export function characterSymbolResponse(symbol: CharacterSymbolRecord): CharacterSymbolApiRecordV1 {
  return {
    id: symbol.id,
    character_id: symbol.characterId,
    name: symbol.name,
    configuration_version: symbol.configurationVersion,
    action: symbol.action,
    revision: symbol.revision,
    created_at: symbol.createdAt,
    updated_at: symbol.updatedAt,
  }
}
