import { createHash } from 'node:crypto'
import { decodeGoSecure } from './go-secure.js'
import type { JsonValue } from './public-read-types.js'

export type LegacyTable =
  | 'external_sources'
  | 'picture_symbols'
  | 'repository_modifiers'
  | 'symbol_repositories'
  | 'symbol_requests'

export interface Reconciliation {
  sourceTable: LegacyTable
  sourceId: number
  fieldPath: string
  valueSha256: string
  action: 'strip_embedded_nul'
  result: 'normalized' | 'kept_existing_clean_key'
}

const allowedTopLevelKeys: Record<LegacyTable, ReadonlySet<string>> = {
  symbol_repositories: new Set([
    'active', 'default_attribution', 'defaults', 'description', 'n_protected_symbols',
    'n_symbols', 'name', 'protected', 'repository_type', 'url',
  ]),
  picture_symbols: new Set([
    'author', 'author_url', 'batch_translations', 'description', 'emoji', 'enabled',
    'file_extension', 'has_skin', 'has_variants', 'has_white', 'image_url', 'license',
    'license_url', 'locales', 'name', 'prior_file_extension', 'prior_image_url',
    'protected', 'protected_symbol', 'rnd', 'search_string', 'boosts', 'use_scores',
    'skin_flood', 'skin_spots',
    'source_url', 'unsafe_result', 'variant_paths',
  ]),
  repository_modifiers: new Set(['defaults']),
  symbol_requests: new Set(['comments', 'n_votes']),
  external_sources: new Set([
    'approved', 'email', 'full_access', 'global_token', 'name', 'org', 'org_url',
    'purpose', 'twitter', 'url',
  ]),
}

const allowedLocaleKeys = new Set([
  'boosts', 'description', 'gtd', 'gtn', 'name', 'name_defaulted', 'recommendations',
  'search_string', 'use_scores', 'uses',
])
const allowedAttributionKeys = new Set(['author_name', 'author_url', 'license', 'license_url'])

export class CatalogMigrationDataError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CatalogMigrationDataError'
  }
}

export function decodeLegacySettings(
  table: LegacyTable,
  sourceId: number,
  value: string | null,
  encryptionKey?: string,
) {
  if (value === null) throw new CatalogMigrationDataError(`${table}:${sourceId} has null settings`)
  const decoded = decodeGoSecure(value, encryptionKey)
  if (!isRecord(decoded)) {
    throw new CatalogMigrationDataError(`${table}:${sourceId} settings must be an object`)
  }
  return decoded
}

export function unknownLegacyKeys(table: LegacyTable, settings: Record<string, JsonValue>) {
  const unknown = Object.keys(settings).filter((key) => !allowedTopLevelKeys[table].has(key))

  if (table === 'symbol_repositories') {
    unknown.push(...unknownNestedKeys(settings.default_attribution, allowedAttributionKeys, 'default_attribution'))
  }

  if (table === 'picture_symbols' && isRecord(settings.locales)) {
    for (const [locale, localized] of Object.entries(settings.locales)) {
      unknown.push(...unknownNestedKeys(localized, allowedLocaleKeys, `locales.${locale || '<empty>'}`))
    }
  }

  return unknown.sort()
}

export function cleanLegacyValue(
  table: LegacyTable,
  sourceId: number,
  value: JsonValue,
  reconciliations: Reconciliation[],
  path = '',
): JsonValue {
  if (typeof value === 'string') {
    if (!value.includes('\0')) return value
    reconciliations.push({
      sourceTable: table,
      sourceId,
      fieldPath: path || '/',
      valueSha256: createHash('sha256').update(value).digest('hex'),
      action: 'strip_embedded_nul',
      result: 'normalized',
    })
    return value.replaceAll('\0', '')
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => cleanLegacyValue(
      table, sourceId, item, reconciliations, `${path}/${index}`,
    ))
  }
  if (isRecord(value)) {
    const cleaned: Record<string, JsonValue> = {}
    const originalKeys = new Map<string, string>()
    const entries = Object.entries(value).sort(([left], [right]) => {
      const leftClean = left.replaceAll('\0', '')
      const rightClean = right.replaceAll('\0', '')
      if (leftClean !== rightClean) return 0
      if (left === leftClean && right !== rightClean) return -1
      if (right === rightClean && left !== leftClean) return 1
      return left.localeCompare(right)
    })
    for (const [key, item] of entries) {
      const cleanedKey = key.replaceAll('\0', '')
      if (cleanedKey !== key) {
        reconciliations.push({
          sourceTable: table,
          sourceId,
          fieldPath: `${path || ''}/<object-key>`,
          valueSha256: createHash('sha256').update(key).digest('hex'),
          action: 'strip_embedded_nul',
          result: Object.hasOwn(cleaned, cleanedKey) && originalKeys.get(cleanedKey) === cleanedKey
            ? 'kept_existing_clean_key'
            : 'normalized',
        })
      }
      if (Object.hasOwn(cleaned, cleanedKey)) {
        const existingOriginalKey = originalKeys.get(cleanedKey)
        if (existingOriginalKey === cleanedKey && key !== cleanedKey) continue
        if (key !== cleanedKey) {
          throw new CatalogMigrationDataError(
            `${table}:${sourceId} contains colliding malformed keys after NUL reconciliation`,
          )
        }
      }
      cleaned[cleanedKey] = cleanLegacyValue(
        table, sourceId, item, reconciliations, `${path}/${jsonPointer(cleanedKey)}`,
      )
      originalKeys.set(cleanedKey, key)
    }
    return cleaned
  }
  return value
}

export function asRecord(value: JsonValue | undefined, field: string) {
  if (value === undefined || value === null) return {}
  if (!isRecord(value)) throw new CatalogMigrationDataError(`${field} must be an object`)
  return value
}

export function nullableString(value: JsonValue | undefined, field: string) {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') throw new CatalogMigrationDataError(`${field} must be a string or null`)
  return value
}

export function nullableBoolean(value: JsonValue | undefined, field: string) {
  if (value === undefined || value === null) return null
  if (typeof value !== 'boolean') throw new CatalogMigrationDataError(`${field} must be a boolean or null`)
  return value
}

export function nullableNumber(value: JsonValue | undefined, field: string) {
  if (value === undefined || value === null) return null
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new CatalogMigrationDataError(`${field} must be a finite number or null`)
  }
  return value
}

export function numericMap(value: JsonValue | undefined, field: string) {
  const record = asRecord(value, field)
  return Object.entries(record).map(([term, score]) => {
    if (typeof score !== 'number' || !Number.isFinite(score)) {
      throw new CatalogMigrationDataError(`${field}.${term} must be a finite number`)
    }
    return { term, score }
  })
}

export function stringMap(value: JsonValue | undefined, field: string) {
  const record = asRecord(value, field)
  return Object.entries(record).map(([key, mapped]) => {
    if (typeof mapped !== 'string') {
      throw new CatalogMigrationDataError(`${field}.${key} must be a string`)
    }
    return { key, value: mapped }
  })
}

export function deliberateLegacyPayload(settings: Record<string, JsonValue>) {
  const payload: Record<string, JsonValue> = {}
  for (const key of ['batch_translations', 'skin_spots']) {
    if (settings[key] !== undefined) payload[key] = settings[key]
  }
  if (isRecord(settings.locales)) {
    const localeEvidence: Record<string, JsonValue> = {}
    for (const [locale, localized] of Object.entries(settings.locales)) {
      if (!isRecord(localized)) continue
      const evidence: Record<string, JsonValue> = {}
      for (const key of ['uses', 'recommendations']) {
        if (localized[key] !== undefined) evidence[key] = localized[key]
      }
      if (Object.keys(evidence).length > 0) localeEvidence[locale] = evidence
    }
    if (Object.keys(localeEvidence).length > 0) payload.locale_tracking = localeEvidence
  }
  return Object.keys(payload).length > 0 ? payload : null
}

function unknownNestedKeys(
  value: JsonValue | undefined,
  allowed: ReadonlySet<string>,
  prefix: string,
) {
  if (value === undefined || value === null) return []
  if (!isRecord(value)) return [`${prefix} (not an object)`]
  return Object.keys(value)
    .filter((key) => !allowed.has(key))
    .map((key) => `${prefix}.${key}`)
}

function isRecord(value: JsonValue | undefined): value is Record<string, JsonValue> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function jsonPointer(value: string) {
  return value.replaceAll('~', '~0').replaceAll('/', '~1')
}
