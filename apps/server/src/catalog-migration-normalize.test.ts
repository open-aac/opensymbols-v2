import { describe, expect, it } from 'vitest'
import {
  CatalogMigrationDataError,
  cleanLegacyValue,
  decodeLegacySettings,
  deliberateLegacyPayload,
  numericMap,
  unknownLegacyKeys,
} from './catalog-migration-normalize.js'

describe('catalog migration normalization', () => {
  it('decodes GoSecure marker settings and inventories unknown keys', () => {
    const settings = decodeLegacySettings(
      'picture_symbols',
      42,
      '**{"name":"Hello","locales":{"en":{"name":"Hello","unexpected":true}},"mystery":1}',
    )
    expect(unknownLegacyKeys('picture_symbols', settings)).toEqual([
      'locales.en.unexpected',
      'mystery',
    ])
  })

  it('rejects null and non-object legacy settings', () => {
    expect(() => decodeLegacySettings('external_sources', 1, null)).toThrow(CatalogMigrationDataError)
    expect(() => decodeLegacySettings('external_sources', 1, '**[]')).toThrow(CatalogMigrationDataError)
  })

  it('strips embedded NULs through a hashed reconciliation record', () => {
    const reconciliations: Parameters<typeof cleanLegacyValue>[3] = []
    const result = cleanLegacyValue(
      'picture_symbols',
      17,
      { locales: { en: { name: 'before\0after' } } },
      reconciliations,
    )
    expect(result).toEqual({ locales: { en: { name: 'beforeafter' } } })
    expect(reconciliations).toEqual([expect.objectContaining({
      sourceTable: 'picture_symbols',
      sourceId: 17,
      fieldPath: '/locales/en/name',
      action: 'strip_embedded_nul',
      result: 'normalized',
      valueSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    })])
    expect(JSON.stringify(reconciliations)).not.toContain('before')
  })

  it('strips embedded NULs from keys and keeps an existing clean key on collision', () => {
    const reconciliations: Parameters<typeof cleanLegacyValue>[3] = []
    expect(cleanLegacyValue(
      'picture_symbols', 18, { 'before\0after': 2 }, reconciliations,
    )).toEqual({ beforeafter: 2 })
    expect(reconciliations[0]).toMatchObject({ fieldPath: '/<object-key>' })
    const collisions: Parameters<typeof cleanLegacyValue>[3] = []
    expect(cleanLegacyValue(
      'picture_symbols', 19, { key: 1, 'k\0ey': 2 }, collisions,
    )).toEqual({ key: 1 })
    expect(collisions[0]).toMatchObject({ result: 'kept_existing_clean_key' })
    expect(() => cleanLegacyValue(
      'picture_symbols', 20, { 'k\0ey': 1, 'ke\0y': 2 }, [],
    )).toThrow(/colliding malformed keys/)
  })

  it('preserves obsolete tracking data only as a versioned migration payload', () => {
    expect(deliberateLegacyPayload({
      batch_translations: { es: 2 },
      locales: { en: { uses: { cup: [1] }, recommendations: { drink: true }, name: 'Cup' } },
      skin_spots: [1, 2],
    })).toEqual({
      batch_translations: { es: 2 },
      locale_tracking: { en: { uses: { cup: [1] }, recommendations: { drink: true } } },
      skin_spots: [1, 2],
    })
  })

  it('rejects non-numeric search scores', () => {
    expect(() => numericMap({ cup: 'high' }, 'use_scores')).toThrow(CatalogMigrationDataError)
  })
})
