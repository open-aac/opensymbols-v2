import { describe, expect, it } from 'vitest'
import { productionArtKit } from '@opensymbols/avatar-svg'
import {
  CHARACTER_CONFIGURATION_VERSION,
  CHARACTER_TEMPLATE_KEY,
  CHARACTER_TEMPLATE_VERSION,
  characterResponse,
  characterSymbolResponse,
  isCharacterId,
  parseCharacterSymbolWrite,
  parseCharacterWrite,
  parseRevision,
} from './character-api.js'
import { testAction, testAvatarArtKit, testIdentity } from './test-fixtures/avatar-art-kit.js'

describe('modular character API contracts', () => {
  const validCharacter = {
    name: '  My character  ',
    template_key: CHARACTER_TEMPLATE_KEY,
    template_version: CHARACTER_TEMPLATE_VERSION,
    configuration_version: CHARACTER_CONFIGURATION_VERSION,
    identity: testIdentity,
  }
  const validSymbol = { name: ' Sam waves ', configuration_version: 1, action: testAction }

  it('normalizes valid character and symbol writes', () => {
    expect(parseCharacterWrite(validCharacter, testAvatarArtKit)).toEqual({
      kind: 'ok',
      value: {
        name: 'My character',
        templateKey: CHARACTER_TEMPLATE_KEY,
        templateVersion: 1,
        configurationVersion: 1,
        identity: testIdentity,
      },
    })
    expect(parseCharacterSymbolWrite(validSymbol, testAvatarArtKit)).toEqual({
      kind: 'ok',
      value: { name: 'Sam waves', configurationVersion: 1, action: testAction },
    })
    const withRenderPayload = parseCharacterSymbolWrite({
      ...validSymbol,
      action: { ...testAction, svg: '<svg>must not be stored</svg>', png: 'data:image/png;base64,no' },
    }, testAvatarArtKit)
    expect(withRenderPayload).toEqual({
      kind: 'ok',
      value: { name: 'Sam waves', configurationVersion: 1, action: testAction },
    })
  })

  it('rejects unsupported parts, palettes, actions, and semantic variants', () => {
    expect(parseCharacterWrite({
      ...validCharacter,
      identity: { ...testIdentity, selections: { ...testIdentity.selections, body: 'missing-body' } },
    }, testAvatarArtKit)).toMatchObject({ kind: 'error', error: 'unsupported_avatar_selection' })
    expect(parseCharacterWrite({
      ...validCharacter,
      identity: { ...testIdentity, colours: { ...testIdentity.colours, skin: 'missing-palette' } },
    }, testAvatarArtKit)).toMatchObject({ kind: 'error', error: 'unsupported_avatar_selection' })
    expect(parseCharacterSymbolWrite({
      ...validSymbol,
      action: { ...testAction, actionId: 'missing-action' },
    }, testAvatarArtKit)).toMatchObject({ kind: 'error', error: 'unsupported_avatar_selection' })
    expect(parseCharacterSymbolWrite({
      ...validSymbol,
      action: { ...testAction, rightHandId: 'grip' },
    }, testAvatarArtKit)).toMatchObject({ kind: 'error', error: 'unsupported_avatar_selection' })
  })

  it('reports pending production artwork explicitly', () => {
    expect(parseCharacterWrite(validCharacter, productionArtKit)).toEqual({ kind: 'error', error: 'avatar_art_unavailable' })
    expect(parseCharacterSymbolWrite(validSymbol, productionArtKit)).toEqual({ kind: 'error', error: 'avatar_art_unavailable' })
  })

  it('rejects malformed versions, names, sided selections, and revisions', () => {
    expect(parseCharacterWrite({ ...validCharacter, name: ' ' }, testAvatarArtKit)).toMatchObject({ error: 'invalid_character' })
    expect(parseCharacterWrite({ ...validCharacter, template_version: 2 }, testAvatarArtKit)).toMatchObject({ error: 'invalid_character' })
    expect(parseCharacterWrite({
      ...validCharacter,
      identity: { ...testIdentity, sidedSelections: { ...testIdentity.sidedSelections, arm: { left: 7, right: null } } },
    }, testAvatarArtKit)).toMatchObject({ error: 'invalid_character' })
    expect(parseCharacterSymbolWrite({ ...validSymbol, configuration_version: 2 }, testAvatarArtKit)).toMatchObject({ error: 'invalid_character_symbol' })
    expect(parseRevision({ revision: 3 })).toBe(3)
    expect(parseRevision({ revision: 0 })).toBeNull()
    expect(parseRevision({ revision: 1.5 })).toBeNull()
    expect(isCharacterId('10000000-0000-4000-8000-000000000001')).toBe(true)
    expect(isCharacterId('not-a-uuid')).toBe(false)
  })

  it('does not expose the Clerk owner identifier in responses', () => {
    expect(characterResponse({
      id: '10000000-0000-4000-8000-000000000001',
      clerkUserId: 'user_secret',
      name: 'My character',
      templateKey: CHARACTER_TEMPLATE_KEY,
      templateVersion: 1,
      configurationVersion: 1,
      identity: testIdentity,
      revision: 2,
      createdAt: '2026-08-03T12:00:00.000Z',
      updatedAt: '2026-08-03T13:00:00.000Z',
    })).not.toHaveProperty('clerk_user_id')
    expect(characterSymbolResponse({
      id: '20000000-0000-4000-8000-000000000001',
      characterId: '10000000-0000-4000-8000-000000000001',
      name: 'Sam waves', configurationVersion: 1, action: testAction, revision: 1,
      createdAt: '2026-08-03T12:00:00.000Z', updatedAt: '2026-08-03T12:00:00.000Z',
    })).toMatchObject({ character_id: '10000000-0000-4000-8000-000000000001', action: testAction })
  })
})
