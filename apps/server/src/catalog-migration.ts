import { createHash, randomUUID } from 'node:crypto'
import { Pool, type PoolClient, type QueryResultRow } from 'pg'
import {
  asRecord,
  CatalogMigrationDataError,
  cleanLegacyValue,
  decodeLegacySettings,
  deliberateLegacyPayload,
  nullableBoolean,
  nullableNumber,
  nullableString,
  numericMap,
  type LegacyTable,
  type Reconciliation,
  stringMap,
  unknownLegacyKeys,
} from './catalog-migration-normalize.js'
import { catalogSchemaSql, catalogTables } from './catalog-schema.js'
import type { JsonValue } from './public-read-types.js'

const sourceTables = [
  'symbol_repositories',
  'picture_symbols',
  'repository_modifiers',
  'symbol_requests',
  'external_sources',
] as const satisfies readonly LegacyTable[]

export const restoredSnapshotBaseline = {
  symbol_repositories: 12,
  picture_symbols: 121_652,
  repository_modifiers: 178,
  symbol_requests: 0,
  external_sources: 192,
} as const

type CountMap = Record<string, number>

interface LegacyRow extends QueryResultRow {
  id: number
  settings: string | null
}

interface RepositoryRow extends LegacyRow {
  repo_key: string
  created_at: Date | string
  updated_at: Date | string
}

interface ModifierRow extends LegacyRow {
  symbol_repository_id: number | null
  repo_key: string
  locale: string
  created_at: Date | string
  updated_at: Date | string
}

interface SymbolRow extends LegacyRow {
  random: number | null
  repo_key: string
  symbol_key: string
  enabled: boolean | null
  created_at: Date | string
  updated_at: Date | string
  has_skin: boolean | null
  unsafe_result: boolean | null
}

interface RequestRow extends LegacyRow {
  phrase: string
  locale: string
  created_at: Date | string
  updated_at: Date | string
}

interface ExternalSourceRow extends LegacyRow {
  token: string
  created_at: Date | string
  updated_at: Date | string
}

export interface CatalogAuditReport {
  sourcePostgresqlVersion: string
  sourceFingerprint: string
  sourceCounts: CountMap
  unknownKeys: Array<{ table: LegacyTable, path: string, occurrences: number }>
  reconciliationCount: number
  matchesRestoredSnapshotBaseline: boolean
}

export interface CatalogVerificationReport {
  snapshotId: string
  status: string
  sourceCounts: CountMap
  normalizedCounts: CountMap
  reconciliationCount: number
  verified: boolean
}

export interface CatalogMigratorOptions {
  connectionString: string
  encryptionKey?: string
  batchSize?: number
  clock?: () => Date
  afterSourceAudit?: () => Promise<void>
}

export class CatalogMigrator {
  private readonly pool: Pool
  private readonly encryptionKey: string | undefined
  private readonly batchSize: number
  private readonly clock: () => Date
  private readonly afterSourceAudit: () => Promise<void>

  constructor(options: CatalogMigratorOptions) {
    this.pool = new Pool({ connectionString: options.connectionString, max: 2 })
    this.encryptionKey = options.encryptionKey
    this.batchSize = options.batchSize ?? 500
    this.clock = options.clock ?? (() => new Date())
    this.afterSourceAudit = options.afterSourceAudit ?? (async () => undefined)
    if (!Number.isInteger(this.batchSize) || this.batchSize < 1 || this.batchSize > 1_000) {
      throw new Error('batchSize must be an integer between 1 and 1000')
    }
  }

  async close() {
    await this.pool.end()
  }

  async audit(): Promise<CatalogAuditReport> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
      const report = await this.auditWithClient(client)
      await client.query('COMMIT')
      return report
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  async migrate(snapshotId: string) {
    validateSnapshotId(snapshotId)
    await this.pool.query(catalogSchemaSql)
    const existing = await this.findRun(snapshotId)
    if (existing?.status === 'completed') return this.verify(snapshotId)
    if (existing) throw new Error(`Migration snapshot ${snapshotId} is already ${existing.status}`)

    const client = await this.pool.connect()
    const runId = randomUUID()
    try {
      await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ')
      const audit = await this.auditWithClient(client)
      if (audit.unknownKeys.length > 0) {
        const summary = audit.unknownKeys.map(({ table, path }) => `${table}.${path}`).join(', ')
        throw new CatalogMigrationDataError(`Unmapped legacy keys prevent migration: ${summary}`)
      }
      await this.afterSourceAudit()
      await client.query(
        `INSERT INTO catalog_migration_runs
           (id, snapshot_id, status, source_postgresql_version, source_fingerprint,
            source_counts, started_at)
         VALUES ($1, $2, 'running', $3, $4, $5::jsonb, $6)`,
        [
          runId, snapshotId, audit.sourcePostgresqlVersion, audit.sourceFingerprint,
          JSON.stringify(audit.sourceCounts), this.clock(),
        ],
      )

      await this.migrateRepositories(client, runId)
      await this.migrateModifiers(client, runId)
      await this.migrateSymbols(client, runId)
      await this.migrateRequests(client, runId)
      await this.migrateApiClients(client, runId)

      const normalizedCounts = await normalizedBaseCounts(client)
      const reconciliationResult = await client.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM catalog_migration_reconciliations WHERE migration_run_id = $1',
        [runId],
      )
      await client.query(
        `UPDATE catalog_migration_runs
         SET status = 'completed', normalized_counts = $2::jsonb,
             reconciliation_count = $3, completed_at = $4
         WHERE id = $1`,
        [
          runId,
          JSON.stringify(normalizedCounts),
          Number(reconciliationResult.rows[0]?.count ?? 0),
          this.clock(),
        ],
      )
      await client.query('COMMIT')
      return {
        snapshotId,
        status: 'completed',
        sourceCounts: audit.sourceCounts,
        normalizedCounts,
        reconciliationCount: Number(reconciliationResult.rows[0]?.count ?? 0),
        verified: sourceTables.every(
          (table) => audit.sourceCounts[table] === normalizedCounts[catalogTableForSource(table)],
        ),
      }
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  async verify(snapshotId: string): Promise<CatalogVerificationReport> {
    validateSnapshotId(snapshotId)
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
      const currentAudit = await this.auditWithClient(client)
      const run = await client.query<{
        id: string
        status: string
        source_fingerprint: string
        source_counts: CountMap
        normalized_counts: CountMap
        reconciliation_count: number
      }>(
        `SELECT id, status, source_fingerprint, source_counts, normalized_counts,
                reconciliation_count
         FROM catalog_migration_runs WHERE snapshot_id = $1`,
        [snapshotId],
      )
      const row = run.rows[0]
      if (!row) throw new Error(`Migration snapshot ${snapshotId} does not exist`)
      const normalizedCounts = await normalizedBaseCounts(client)
      const sourceCounts = numericCountMap(row.source_counts)
      const recordedNormalizedCounts = numericCountMap(row.normalized_counts)
      const verified = row.status === 'completed'
        && row.source_fingerprint === currentAudit.sourceFingerprint
        && Object.entries(sourceCounts).every(
          ([table, count]) => currentAudit.sourceCounts[table] === count,
        )
        && sourceTables.every(
          (table) => sourceCounts[table] === normalizedCounts[catalogTableForSource(table)],
        )
        && Object.entries(recordedNormalizedCounts).every(
          ([table, count]) => normalizedCounts[table] === count,
        )
        && row.reconciliation_count === normalizedCounts.catalog_migration_reconciliations
      await client.query('COMMIT')
      return {
        snapshotId,
        status: row.status,
        sourceCounts,
        normalizedCounts,
        reconciliationCount: row.reconciliation_count,
        verified,
      }
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  async rollback(snapshotId: string) {
    validateSnapshotId(snapshotId)
    await this.pool.query(catalogSchemaSql)
    const result = await this.pool.query(
      'DELETE FROM catalog_migration_runs WHERE snapshot_id = $1 RETURNING id',
      [snapshotId],
    )
    return { snapshotId, rolledBack: result.rowCount === 1 }
  }

  private async auditWithClient(client: PoolClient): Promise<CatalogAuditReport> {
    const sourceCounts = await legacyCounts(client)
    const versionResult = await client.query<{ server_version: string }>('SHOW server_version')
    const unknown = new Map<string, number>()
    const fingerprint = createHash('sha256')
    let reconciliationCount = 0

    for (const table of sourceTables) {
      let lastId = 0
      for (;;) {
        const result = await client.query<LegacyRow>(
          `SELECT * FROM ${table} WHERE id > $1 ORDER BY id LIMIT $2`,
          [lastId, this.batchSize],
        )
        if (result.rows.length === 0) break
        for (const row of result.rows) {
          fingerprint.update(table).update('\0').update(JSON.stringify(row)).update('\n')
          const settings = decodeLegacySettings(table, row.id, row.settings, this.encryptionKey)
          for (const path of unknownLegacyKeys(table, settings)) {
            const key = `${table}\u0000${path}`
            unknown.set(key, (unknown.get(key) ?? 0) + 1)
          }
          const reconciliations: Reconciliation[] = []
          cleanLegacyValue(table, row.id, settings, reconciliations)
          reconciliationCount += reconciliations.length
        }
        lastId = result.rows.at(-1)!.id
      }
    }

    return {
      sourcePostgresqlVersion: versionResult.rows[0]?.server_version ?? 'unknown',
      sourceFingerprint: fingerprint.digest('hex'),
      sourceCounts,
      unknownKeys: [...unknown.entries()].map(([key, occurrences]) => {
        const [table, path] = key.split('\u0000') as [LegacyTable, string]
        return { table, path, occurrences }
      }).sort((left, right) => `${left.table}.${left.path}`.localeCompare(`${right.table}.${right.path}`)),
      reconciliationCount,
      matchesRestoredSnapshotBaseline: Object.entries(restoredSnapshotBaseline).every(
        ([table, count]) => sourceCounts[table] === count,
      ),
    }
  }

  private async migrateRepositories(client: PoolClient, runId: string) {
    const result = await client.query<RepositoryRow>(
      'SELECT id, repo_key, settings, created_at, updated_at FROM symbol_repositories ORDER BY id',
    )
    for (const source of result.rows) {
      const { settings, reconciliations } = this.normalizedSettings('symbol_repositories', source)
      const attribution = asRecord(settings.default_attribution, 'default_attribution')
      await client.query(
        `INSERT INTO catalog_repositories
          (id, migration_run_id, repo_key, name, description, website_url, active, protected,
           repository_type, symbol_count, protected_symbol_count, attribution_license,
           attribution_license_url, attribution_author_name, attribution_author_url,
           created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [
          source.id, runId, source.repo_key,
          nullableString(settings.name, 'name'),
          nullableString(settings.description, 'description'),
          nullableString(settings.url, 'url'),
          nullableBoolean(settings.active, 'active') ?? true,
          nullableBoolean(settings.protected, 'protected') ?? false,
          nullableString(settings.repository_type, 'repository_type'),
          nullableNumber(settings.n_symbols, 'n_symbols'),
          nullableNumber(settings.n_protected_symbols, 'n_protected_symbols'),
          nullableString(attribution.license, 'default_attribution.license'),
          nullableString(attribution.license_url, 'default_attribution.license_url'),
          nullableString(attribution.author_name, 'default_attribution.author_name'),
          nullableString(attribution.author_url, 'default_attribution.author_url'),
          source.created_at, source.updated_at,
        ],
      )
      await this.insertReconciliations(client, runId, reconciliations)
      for (const entry of stringMap(settings.defaults, 'defaults')) {
        await client.query(
          `INSERT INTO catalog_repository_defaults
             (migration_run_id, repository_id, repository_modifier_id, locale, search_term, symbol_key)
           VALUES ($1,$2,NULL,'en',$3,$4)`,
          [runId, source.id, entry.key, entry.value],
        )
      }
    }
  }

  private async migrateModifiers(client: PoolClient, runId: string) {
    const result = await client.query<ModifierRow>(
      `SELECT id, symbol_repository_id, repo_key, locale, settings, created_at, updated_at
       FROM repository_modifiers ORDER BY id`,
    )
    for (const source of result.rows) {
      const { settings, reconciliations } = this.normalizedSettings('repository_modifiers', source)
      const repositoryId = source.symbol_repository_id ?? await repositoryIdForKey(client, source.repo_key)
      await client.query(
        `INSERT INTO catalog_repository_modifiers
          (id, migration_run_id, repository_id, repo_key, locale, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [source.id, runId, repositoryId, source.repo_key, source.locale, source.created_at, source.updated_at],
      )
      await this.insertReconciliations(client, runId, reconciliations)
      const defaults = stringMap(settings.defaults, 'defaults')
      for (let index = 0; index < defaults.length; index += this.batchSize) {
        await bulkInsert(client, 'catalog_repository_defaults', [
          'migration_run_id', 'repository_id', 'repository_modifier_id', 'locale', 'search_term', 'symbol_key',
        ], defaults.slice(index, index + this.batchSize).map((entry) => [
          runId, repositoryId, source.id, source.locale, entry.key, entry.value,
        ]))
      }
    }
  }

  private async migrateSymbols(client: PoolClient, runId: string) {
    let lastId = 0
    for (;;) {
      const result = await client.query<SymbolRow>(
        `SELECT id, random, repo_key, symbol_key, enabled, created_at, updated_at,
                has_skin, unsafe_result, settings
         FROM picture_symbols WHERE id > $1 ORDER BY id LIMIT $2`,
        [lastId, this.batchSize],
      )
      if (result.rows.length === 0) break
      const repositoryIds = await repositoryIdsForKeys(client, result.rows.map((row) => row.repo_key))
      const symbolRows: unknown[][] = []
      const localizationRows: unknown[][] = []
      const signalRows: unknown[][] = []
      const variantRows: unknown[][] = []
      const extensionRows: unknown[][] = []
      const reconciliationRows: unknown[][] = []
      for (const source of result.rows) {
        const { settings, reconciliations } = this.normalizedSettings('picture_symbols', source)
        const repositoryId = repositoryIds.get(source.repo_key)
        if (!repositoryId) throw new CatalogMigrationDataError(`Unknown repository ${source.repo_key}`)
        symbolRows.push([
          source.id, runId, repositoryId, source.symbol_key,
          nullableString(settings.name, 'name'), nullableString(settings.description, 'description'),
          source.enabled, nullableBoolean(settings.enabled, 'enabled'), source.has_skin,
          nullableBoolean(settings.has_skin, 'has_skin'),
          nullableBoolean(settings.has_variants, 'has_variants') ?? false,
          nullableBoolean(settings.has_white, 'has_white') ?? false,
          source.unsafe_result, nullableBoolean(settings.unsafe_result, 'unsafe_result'),
          nullableBoolean(settings.protected, 'protected') ?? false,
          nullableBoolean(settings.protected_symbol, 'protected_symbol') ?? false,
          source.random, nullableNumber(settings.rnd, 'rnd'),
          nullableString(settings.image_url, 'image_url'),
          nullableString(settings.file_extension, 'file_extension'),
          nullableString(settings.license, 'license'), nullableString(settings.license_url, 'license_url'),
          nullableString(settings.author, 'author'), nullableString(settings.author_url, 'author_url'),
          nullableString(settings.source_url, 'source_url'), nullableString(settings.emoji, 'emoji'),
          nullableString(settings.prior_image_url, 'prior_image_url'),
          nullableString(settings.prior_file_extension, 'prior_file_extension'),
          nullableNumber(settings.skin_flood, 'skin_flood'),
          nullableString(settings.search_string, 'search_string'), source.created_at, source.updated_at,
        ])
        this.collectSymbolChildren(
          runId, source.id, settings, localizationRows, signalRows, variantRows, extensionRows,
        )
        reconciliationRows.push(...reconciliations.map((item) => [
          runId, item.sourceTable, item.sourceId, item.fieldPath, item.valueSha256, item.action, item.result,
        ]))
      }
      await insertRowsInChunks(client, 'catalog_symbols', [
        'id', 'migration_run_id', 'repository_id', 'symbol_key', 'name', 'description',
        'row_enabled', 'settings_enabled', 'row_has_skin', 'settings_has_skin', 'has_variants',
        'has_white', 'row_unsafe', 'settings_unsafe', 'protected', 'protected_symbol',
        'random_order', 'random_weight', 'image_url', 'file_extension', 'license', 'license_url',
        'author', 'author_url', 'source_url', 'emoji', 'prior_image_url', 'prior_file_extension',
        'skin_flood', 'search_string', 'created_at', 'updated_at',
      ], symbolRows)
      await insertRowsInChunks(client, 'catalog_symbol_localizations', [
        'migration_run_id', 'symbol_id', 'locale', 'name', 'description', 'search_string',
        'name_defaulted', 'generated_name', 'generated_description', 'batch_translation',
      ], localizationRows)
      await insertRowsInChunks(client, 'catalog_symbol_search_signals', [
        'migration_run_id', 'symbol_id', 'locale', 'term', 'signal_type', 'score',
      ], signalRows)
      await insertRowsInChunks(client, 'catalog_symbol_variants', [
        'migration_run_id', 'symbol_id', 'variant_key', 'object_path',
      ], variantRows)
      await insertRowsInChunks(client, 'catalog_legacy_extensions', [
        'migration_run_id', 'source_table', 'source_id', 'schema_version', 'payload',
      ], extensionRows)
      await insertRowsInChunks(client, 'catalog_migration_reconciliations', [
        'migration_run_id', 'source_table', 'source_id', 'field_path', 'value_sha256', 'action', 'result',
      ], reconciliationRows)
      lastId = result.rows.at(-1)!.id
    }
  }

  private collectSymbolChildren(
    runId: string,
    symbolId: number,
    settings: Record<string, JsonValue>,
    localizationRows: unknown[][],
    signalRows: unknown[][],
    variantRows: unknown[][],
    extensionRows: unknown[][],
  ) {
    const locales = asRecord(settings.locales, 'locales')
    const translations = asRecord(settings.batch_translations, 'batch_translations')
    for (const [locale, localizedValue] of Object.entries(locales)) {
      const localized = asRecord(localizedValue, `locales.${locale}`)
      const translated = translations[locale]
      const batchTranslation = translated === undefined
        ? null
        : nullableNumber(translated, `batch_translations.${locale}`)
      localizationRows.push([
        runId, symbolId, locale,
        nullableString(localized.name, `locales.${locale}.name`),
        nullableString(localized.description, `locales.${locale}.description`),
        nullableString(localized.search_string, `locales.${locale}.search_string`),
        nullableBoolean(localized.name_defaulted, `locales.${locale}.name_defaulted`),
        nullableBoolean(localized.gtn, `locales.${locale}.gtn`),
        nullableBoolean(localized.gtd, `locales.${locale}.gtd`),
        batchTranslation,
      ])
      for (const signalType of ['boosts', 'use_scores'] as const) {
        for (const { term, score } of numericMap(localized[signalType], `locales.${locale}.${signalType}`)) {
          signalRows.push([
            runId, symbolId, locale, term, signalType === 'boosts' ? 'boost' : 'use_score', score,
          ])
        }
      }
    }

    for (const entry of stringMap(settings.variant_paths, 'variant_paths')) {
      variantRows.push([runId, symbolId, entry.key, entry.value])
    }

    const legacyPayload = deliberateLegacyPayload(settings)
    if (legacyPayload) {
      extensionRows.push([runId, 'picture_symbols', symbolId, 1, JSON.stringify(legacyPayload)])
    }
  }

  private async migrateRequests(client: PoolClient, runId: string) {
    const result = await client.query<RequestRow>(
      'SELECT id, phrase, locale, settings, created_at, updated_at FROM symbol_requests ORDER BY id',
    )
    for (const source of result.rows) {
      const { settings, reconciliations } = this.normalizedSettings('symbol_requests', source)
      const comments = settings.comments === undefined ? [] : settings.comments
      if (!Array.isArray(comments)) throw new CatalogMigrationDataError('symbol_requests.comments must be an array')
      const voteCount = nullableNumber(settings.n_votes, 'n_votes') ?? comments.length
      await client.query(
        `INSERT INTO catalog_symbol_requests
          (id, migration_run_id, phrase, locale, vote_count, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [source.id, runId, source.phrase, source.locale, voteCount, source.created_at, source.updated_at],
      )
      for (const [ordinal, commentValue] of comments.entries()) {
        const comment = asRecord(commentValue, `comments.${ordinal}`)
        await client.query(
          `INSERT INTO catalog_symbol_request_comments
            (migration_run_id, request_id, ordinal, user_id, comment_text, commented_at)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [
            runId, source.id, ordinal,
            nullableString(comment.user_id, `comments.${ordinal}.user_id`),
            nullableString(comment.text, `comments.${ordinal}.text`) ?? '',
            nullableString(comment.timestamp, `comments.${ordinal}.timestamp`) ?? source.created_at,
          ],
        )
      }
      await this.insertReconciliations(client, runId, reconciliations)
    }
  }

  private async migrateApiClients(client: PoolClient, runId: string) {
    const result = await client.query<ExternalSourceRow>(
      'SELECT id, token, settings, created_at, updated_at FROM external_sources ORDER BY id',
    )
    for (const source of result.rows) {
      const { settings, reconciliations } = this.normalizedSettings('external_sources', source)
      await client.query(
        `INSERT INTO catalog_api_clients
          (id, migration_run_id, shared_secret, name, email, purpose, organization,
           organization_url, website_url, twitter, approved, full_access, global_token,
           created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [
          source.id, runId, source.token,
          nullableString(settings.name, 'name'), nullableString(settings.email, 'email'),
          nullableString(settings.purpose, 'purpose'), nullableString(settings.org, 'org'),
          nullableString(settings.org_url, 'org_url'), nullableString(settings.url, 'url'),
          nullableString(settings.twitter, 'twitter'),
          nullableBoolean(settings.approved, 'approved') ?? false,
          nullableBoolean(settings.full_access, 'full_access') ?? false,
          nullableBoolean(settings.global_token, 'global_token') ?? false,
          source.created_at, source.updated_at,
        ],
      )
      await this.insertReconciliations(client, runId, reconciliations)
    }
  }

  private normalizedSettings(table: LegacyTable, row: LegacyRow) {
    const decoded = decodeLegacySettings(table, row.id, row.settings, this.encryptionKey)
    const reconciliations: Reconciliation[] = []
    const cleaned = cleanLegacyValue(table, row.id, decoded, reconciliations)
    return { settings: asRecord(cleaned, `${table}:${row.id}`), reconciliations }
  }

  private async insertReconciliations(
    client: PoolClient,
    runId: string,
    reconciliations: Reconciliation[],
  ) {
    for (const item of reconciliations) {
      await client.query(
        `INSERT INTO catalog_migration_reconciliations
          (migration_run_id, source_table, source_id, field_path, value_sha256, action, result)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [runId, item.sourceTable, item.sourceId, item.fieldPath, item.valueSha256, item.action, item.result],
      )
    }
  }

  private async findRun(snapshotId: string) {
    const result = await this.pool.query<{ status: string }>(
      `SELECT status FROM catalog_migration_runs WHERE snapshot_id = $1`,
      [snapshotId],
    )
    return result.rows[0]
  }
}

async function legacyCounts(client: PoolClient) {
  const counts: CountMap = {}
  for (const table of sourceTables) {
    const result = await client.query<{ count: string }>(`SELECT count(*)::text AS count FROM ${table}`)
    counts[table] = Number(result.rows[0]?.count ?? 0)
  }
  return counts
}

async function normalizedBaseCounts(client: PoolClient) {
  const counts: CountMap = {}
  for (const table of catalogTables) {
    const result = await client.query<{ count: string }>(`SELECT count(*)::text AS count FROM ${table}`)
    counts[table] = Number(result.rows[0]?.count ?? 0)
  }
  return counts
}

function catalogTableForSource(table: LegacyTable) {
  return ({
    symbol_repositories: 'catalog_repositories',
    picture_symbols: 'catalog_symbols',
    repository_modifiers: 'catalog_repository_modifiers',
    symbol_requests: 'catalog_symbol_requests',
    external_sources: 'catalog_api_clients',
  } as const)[table]
}

async function repositoryIdForKey(client: PoolClient, repoKey: string) {
  const result = await client.query<{ id: number }>(
    'SELECT id FROM catalog_repositories WHERE repo_key = $1',
    [repoKey],
  )
  const id = result.rows[0]?.id
  if (!id) throw new CatalogMigrationDataError(`Unknown repository ${repoKey}`)
  return id
}

async function repositoryIdsForKeys(client: PoolClient, repoKeys: string[]) {
  const result = await client.query<{ id: number, repo_key: string }>(
    'SELECT id, repo_key FROM catalog_repositories WHERE repo_key = ANY($1::text[])',
    [[...new Set(repoKeys)]],
  )
  return new Map(result.rows.map((row) => [row.repo_key, row.id]))
}

async function bulkInsert(
  client: PoolClient,
  table: string,
  columns: string[],
  rows: unknown[][],
) {
  if (rows.length === 0) return
  const values = rows.flat()
  const rowSql = rows.map((_, rowIndex) => `(${columns.map(
    (_column, columnIndex) => `$${rowIndex * columns.length + columnIndex + 1}`,
  ).join(',')})`).join(',')
  await client.query(`INSERT INTO ${table} (${columns.join(',')}) VALUES ${rowSql}`, values)
}

async function insertRowsInChunks(
  client: PoolClient,
  table: string,
  columns: string[],
  rows: unknown[][],
) {
  const chunkSize = Math.min(500, Math.floor(60_000 / columns.length))
  for (let index = 0; index < rows.length; index += chunkSize) {
    await bulkInsert(client, table, columns, rows.slice(index, index + chunkSize))
  }
}

function validateSnapshotId(snapshotId: string) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(snapshotId)) {
    throw new Error('snapshot-id must contain 1-80 letters, numbers, dots, underscores, or hyphens')
  }
}

function numericCountMap(value: CountMap) {
  return Object.fromEntries(Object.entries(value).map(([key, count]) => [key, Number(count)]))
}
