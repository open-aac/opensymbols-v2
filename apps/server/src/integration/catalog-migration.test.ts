import { createHash } from 'node:crypto'
import { Pool } from 'pg'
import { describe, expect, it } from 'vitest'
import { CatalogMigrator } from '../catalog-migration.js'

const databaseIntegration = process.env.RUN_DATABASE_INTEGRATION === '1' ? describe : describe.skip

function adminDatabaseUrl() {
  if (process.env.DATABASE_ADMIN_URL) return process.env.DATABASE_ADMIN_URL
  const user = encodeURIComponent(process.env.POSTGRES_USER ?? 'opensymbols')
  const password = encodeURIComponent(process.env.POSTGRES_PASSWORD ?? 'opensymbols')
  const port = process.env.POSTGRES_PORT ?? '5432'
  return `postgresql://${user}:${password}@127.0.0.1:${port}/postgres`
}

databaseIntegration('CatalogMigrator integration', () => {
  it('migrates, verifies, reruns, and rolls back without changing legacy rows', async () => {
    const databaseName = `opensymbols_catalog_test_${process.pid}_${Date.now()}`
    const admin = new Pool({ connectionString: adminDatabaseUrl() })
    let database: Pool | undefined
    let migrator: CatalogMigrator | undefined

    try {
      await admin.query(`CREATE DATABASE "${databaseName}"`)
      const databaseUrl = new URL(adminDatabaseUrl())
      databaseUrl.pathname = `/${databaseName}`
      const connectionString = databaseUrl.toString()
      database = new Pool({ connectionString })
      await database.query(`
        CREATE TABLE symbol_repositories (
          id bigint PRIMARY KEY, repo_key text NOT NULL UNIQUE, settings text,
          created_at timestamp NOT NULL, updated_at timestamp NOT NULL
        );
        CREATE TABLE repository_modifiers (
          id bigint PRIMARY KEY, symbol_repository_id bigint, locale text, repo_key text,
          settings text, created_at timestamp NOT NULL, updated_at timestamp NOT NULL
        );
        CREATE TABLE picture_symbols (
          id bigint PRIMARY KEY, settings text, random integer, repo_key text, symbol_key text,
          enabled boolean, created_at timestamp NOT NULL, updated_at timestamp NOT NULL,
          has_skin boolean, unsafe_result boolean
        );
        CREATE TABLE symbol_requests (
          id bigint PRIMARY KEY, settings text, phrase text, locale text,
          created_at timestamp NOT NULL, updated_at timestamp NOT NULL
        );
        CREATE TABLE external_sources (
          id bigint PRIMARY KEY, settings text, token text,
          created_at timestamp NOT NULL, updated_at timestamp NOT NULL
        );
      `)
      const timestamp = '2026-08-12T10:00:00.000Z'
      await database.query(
        `INSERT INTO symbol_repositories VALUES
          (7, 'demo', $1, $2, $2),
          (9, 'hidden', $3, $2, $2)`,
        [
          '**{"name":"Demo","active":true,"protected":false,"default_attribution":{"license":"CC-BY","author_name":"Artist"},"defaults":{}}',
          timestamp,
          '**{"name":"Hidden","active":false,"protected":true,"defaults":{}}',
        ],
      )
      await database.query(
        `INSERT INTO repository_modifiers VALUES
          (14, 7, 'en', 'demo', '**{"defaults":{"cup":"cup-key"}}', $1, $1)`,
        [timestamp],
      )
      await database.query(
        `INSERT INTO picture_symbols VALUES
          (101, $1, 4, 'demo', 'cup-key', true, $2, $2, true, false),
          (205, $3, 8, 'hidden', 'hidden-key', false, $2, $2, false, true)`,
        [
          `**${JSON.stringify({
            name: 'Cup', enabled: true, has_skin: true, has_variants: true,
            use_scores: { vessel: 3 },
            image_url: 'https://cdn.example/cup.svg', file_extension: 'svg',
            locales: { en: { name: 'Cup\0', search_string: 'cup drink', boosts: { cup: 4 }, uses: { cup: [1] } } },
            variant_paths: { dark: 'cup-dark.svg' }, skin_spots: [1],
          })}`,
          timestamp,
          '**{"name":"Hidden","locales":{"en":{"name":"Hidden"}},"protected_symbol":true}',
        ],
      )
      await database.query(
        `INSERT INTO symbol_requests VALUES
          (2, $1, 'More tea', 'en', $2, $2)`,
        [
          `**${JSON.stringify({ comments: [{ user_id: null, text: 'Please', timestamp }], n_votes: 1 })}`,
          timestamp,
        ],
      )
      await database.query(
        `INSERT INTO external_sources VALUES
          (3, $1, 'shared-secret', $2, $2)`,
        ['**{"name":"Client","approved":true,"full_access":false,"global_token":false}', timestamp],
      )

      const legacyBefore = await legacyFingerprint(database)
      migrator = new CatalogMigrator({ connectionString, batchSize: 1 })
      const audit = await migrator.audit()
      expect(audit.sourceCounts).toEqual({
        symbol_repositories: 2,
        picture_symbols: 2,
        repository_modifiers: 1,
        symbol_requests: 1,
        external_sources: 1,
      })
      expect(audit.unknownKeys).toEqual([])
      expect(audit.reconciliationCount).toBe(1)

      const first = await migrator.migrate('fixture-001')
      expect(first.verified).toBe(true)
      expect(first.normalizedCounts).toMatchObject({
        catalog_repositories: 2,
        catalog_symbols: 2,
        catalog_repository_modifiers: 1,
        catalog_symbol_requests: 1,
        catalog_api_clients: 1,
      })
      expect(await migrator.migrate('fixture-001')).toEqual(first)

      const symbol = await database.query(
        `SELECT id, name, row_enabled, settings_enabled, row_has_skin, settings_has_skin
         FROM catalog_symbols WHERE id = 101`,
      )
      expect(symbol.rows[0]).toMatchObject({
        id: '101', name: 'Cup', row_enabled: true, settings_enabled: true,
        row_has_skin: true, settings_has_skin: true,
      })
      const locale = await database.query(
        `SELECT name, search_string FROM catalog_symbol_localizations
         WHERE symbol_id = 101 AND locale = 'en'`,
      )
      expect(locale.rows[0]).toEqual({ name: 'Cup', search_string: 'cup drink' })
      const baseSignal = await database.query(
        `SELECT locale, scope, term, signal_type, score
         FROM catalog_symbol_search_signals
         WHERE symbol_id = 101 AND scope = 'base'`,
      )
      expect(baseSignal.rows).toEqual([{
        locale: 'en', scope: 'base', term: 'vessel', signal_type: 'use_score', score: 3,
      }])
      const reconciliation = await database.query(
        `SELECT field_path, value_sha256, action, result
         FROM catalog_migration_reconciliations`,
      )
      expect(reconciliation.rows[0]).toMatchObject({
        field_path: '/locales/en/name',
        value_sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        action: 'strip_embedded_nul',
        result: 'normalized',
      })
      expect(JSON.stringify(reconciliation.rows)).not.toContain('Cup')

      expect(await legacyFingerprint(database)).toBe(legacyBefore)
      expect(await migrator.rollback('fixture-001')).toEqual({
        snapshotId: 'fixture-001', rolledBack: true,
      })
      expect((await database.query('SELECT count(*)::int AS count FROM catalog_symbols')).rows[0].count).toBe(0)
      expect(await legacyFingerprint(database)).toBe(legacyBefore)

      await migrator.close()
      let releaseMigration: (() => void) | undefined
      let signalAuditComplete: (() => void) | undefined
      const auditComplete = new Promise<void>((resolve) => { signalAuditComplete = resolve })
      const continueMigration = new Promise<void>((resolve) => { releaseMigration = resolve })
      migrator = new CatalogMigrator({
        connectionString,
        batchSize: 1,
        afterSourceAudit: async () => {
          signalAuditComplete?.()
          await continueMigration
        },
      })

      const concurrentMigration = migrator.migrate('fixture-concurrent')
      await auditComplete
      await database.query(
        `UPDATE picture_symbols
         SET settings = replace(settings, '"name":"Cup"', '"name":"Changed"')
         WHERE id = 101`,
      )
      releaseMigration?.()

      const concurrentResult = await concurrentMigration
      expect(concurrentResult.verified).toBe(true)
      const copiedDuringWrite = await database.query(
        'SELECT name FROM catalog_symbols WHERE id = 101',
      )
      expect(copiedDuringWrite.rows[0]?.name).toBe('Cup')
      expect((await migrator.verify('fixture-concurrent')).verified).toBe(false)

      await database.query(
        `UPDATE picture_symbols
         SET settings = replace(settings, '"name":"Changed"', '"name":"Cup"')
         WHERE id = 101`,
      )
      expect((await migrator.verify('fixture-concurrent')).verified).toBe(true)
      expect(await migrator.rollback('fixture-concurrent')).toEqual({
        snapshotId: 'fixture-concurrent', rolledBack: true,
      })
      expect(await legacyFingerprint(database)).toBe(legacyBefore)
    } finally {
      await migrator?.close()
      await database?.end()
      await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`)
      await admin.end()
    }
  }, 30_000)
})

async function legacyFingerprint(database: Pool) {
  const result = await database.query(`
    SELECT table_name, id, settings
    FROM (
      SELECT 'symbol_repositories' AS table_name, id, settings FROM symbol_repositories
      UNION ALL SELECT 'picture_symbols', id, settings FROM picture_symbols
      UNION ALL SELECT 'repository_modifiers', id, settings FROM repository_modifiers
      UNION ALL SELECT 'symbol_requests', id, settings FROM symbol_requests
      UNION ALL SELECT 'external_sources', id, settings FROM external_sources
    ) rows
    ORDER BY table_name, id
  `)
  return createHash('sha256').update(JSON.stringify(result.rows)).digest('hex')
}
