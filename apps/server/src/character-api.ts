import type { CharacterRecord, CharacterWrite } from './character-store.js'

export const CHARACTER_TEMPLATE_KEY = 'base-character-prototype'
export const CHARACTER_TEMPLATE_VERSION = 1
export const CHARACTER_CONFIGURATION_VERSION = 1
export const CHARACTER_NAME_MAX_LENGTH = 80

const skinColours = new Set(['original', 'light', 'medium-light', 'medium', 'medium-dark', 'dark'])
const hairColours = new Set(['original', 'black', 'dark-brown', 'brown', 'light-brown', 'blond', 'auburn', 'grey', 'white'])
const shirtColours = new Set(['original', 'black', 'white', 'grey', 'red', 'orange', 'yellow', 'green', 'blue', 'purple'])
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && !Array.isArray(value) && typeof value === 'object'
    ? value as Record<string, unknown>
    : null
}

export function parseCharacterWrite(value: unknown): CharacterWrite | null {
  const input = object(value)
  const settings = object(input?.settings)
  if (!input || !settings) return null

  const name = typeof input.name === 'string' ? input.name.trim() : ''
  const skinColour = settings.skin_colour
  const hairColour = settings.hair_colour === undefined ? 'original' : settings.hair_colour
  const shirtColour = settings.shirt_colour === undefined ? 'original' : settings.shirt_colour
  if (!name || name.length > CHARACTER_NAME_MAX_LENGTH) return null
  if (input.template_key !== CHARACTER_TEMPLATE_KEY) return null
  if (input.template_version !== CHARACTER_TEMPLATE_VERSION) return null
  if (input.configuration_version !== CHARACTER_CONFIGURATION_VERSION) return null
  if (typeof skinColour !== 'string' || !skinColours.has(skinColour)) return null
  if (typeof hairColour !== 'string' || !hairColours.has(hairColour)) return null
  if (typeof shirtColour !== 'string' || !shirtColours.has(shirtColour)) return null

  return {
    name,
    templateKey: CHARACTER_TEMPLATE_KEY,
    templateVersion: CHARACTER_TEMPLATE_VERSION,
    configurationVersion: CHARACTER_CONFIGURATION_VERSION,
    settings: {
      skinColour: skinColour as CharacterWrite['settings']['skinColour'],
      hairColour: hairColour as CharacterWrite['settings']['hairColour'],
      shirtColour: shirtColour as CharacterWrite['settings']['shirtColour'],
    },
  }
}

export function parseCharacterRevision(value: unknown) {
  const input = object(value)
  return Number.isInteger(input?.revision) && Number(input?.revision) > 0
    ? Number(input?.revision)
    : null
}

export function isCharacterId(value: string) {
  return uuid.test(value)
}

export function characterResponse(character: CharacterRecord) {
  return {
    id: character.id,
    name: character.name,
    template_key: character.templateKey,
    template_version: character.templateVersion,
    configuration_version: character.configurationVersion,
    settings: {
      skin_colour: character.settings.skinColour,
      hair_colour: character.settings.hairColour ?? 'original',
      shirt_colour: character.settings.shirtColour ?? 'original',
    },
    revision: character.revision,
    created_at: character.createdAt,
    updated_at: character.updatedAt,
  }
}
