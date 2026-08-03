import { describe, expect, it } from 'vitest'
import {
  CHARACTER_CONFIGURATION_VERSION,
  CHARACTER_TEMPLATE_KEY,
  CHARACTER_TEMPLATE_VERSION,
  characterResponse,
  isCharacterId,
  parseCharacterRevision,
  parseCharacterWrite,
} from './character-api.js'

describe('character API contracts', () => {
  const valid = {
    name: '  My character  ',
    template_key: CHARACTER_TEMPLATE_KEY,
    template_version: CHARACTER_TEMPLATE_VERSION,
    configuration_version: CHARACTER_CONFIGURATION_VERSION,
    settings: { skin_colour: 'medium-dark', hair_colour: 'auburn' },
  }

  it('normalizes valid writes and accepts only known versioned settings', () => {
    expect(parseCharacterWrite(valid)).toEqual({
      name: 'My character',
      templateKey: CHARACTER_TEMPLATE_KEY,
      templateVersion: 1,
      configurationVersion: 1,
      settings: { skinColour: 'medium-dark', hairColour: 'auburn' },
    })
    expect(parseCharacterWrite({ ...valid, name: ' '.repeat(2) })).toBeNull()
    expect(parseCharacterWrite({ ...valid, name: 'x'.repeat(81) })).toBeNull()
    expect(parseCharacterWrite({ ...valid, template_version: 2 })).toBeNull()
    expect(parseCharacterWrite({ ...valid, settings: { skin_colour: 'custom' } })).toBeNull()
    expect(parseCharacterWrite({ ...valid, settings: { skin_colour: 'medium', hair_colour: 'blue' } })).toBeNull()
    expect(parseCharacterWrite({ ...valid, settings: { skin_colour: 'medium', hair_colour: null } })).toBeNull()
    expect(parseCharacterWrite({ ...valid, settings: { skin_colour: 'medium' } })).toMatchObject({
      settings: { hairColour: 'original' },
    })
    expect(parseCharacterWrite(null)).toBeNull()
  })

  it('validates revisions and opaque UUID identifiers', () => {
    expect(parseCharacterRevision({ revision: 3 })).toBe(3)
    expect(parseCharacterRevision({ revision: 0 })).toBeNull()
    expect(parseCharacterRevision({ revision: 1.5 })).toBeNull()
    expect(isCharacterId('10000000-0000-4000-8000-000000000001')).toBe(true)
    expect(isCharacterId('not-a-uuid')).toBe(false)
  })

  it('never exposes the Clerk owner identifier in responses', () => {
    expect(characterResponse({
      id: '10000000-0000-4000-8000-000000000001',
      clerkUserId: 'user_secret',
      name: 'My character',
      templateKey: CHARACTER_TEMPLATE_KEY,
      templateVersion: 1,
      configurationVersion: 1,
      settings: { skinColour: 'dark', hairColour: 'grey' },
      revision: 2,
      createdAt: '2026-08-03T12:00:00.000Z',
      updatedAt: '2026-08-03T13:00:00.000Z',
    })).toEqual({
      id: '10000000-0000-4000-8000-000000000001',
      name: 'My character',
      template_key: CHARACTER_TEMPLATE_KEY,
      template_version: 1,
      configuration_version: 1,
      settings: { skin_colour: 'dark', hair_colour: 'grey' },
      revision: 2,
      created_at: '2026-08-03T12:00:00.000Z',
      updated_at: '2026-08-03T13:00:00.000Z',
    })
  })
})
