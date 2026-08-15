import { Pool } from 'pg'
import { describe, expect, it } from 'vitest'
import { createApp } from '../app.js'
import { catalogSchemaSql } from '../catalog-schema.js'
import { createPostgresPublicReadStore } from '../public-read-store.js'

const databaseIntegration = process.env.RUN_DATABASE_INTEGRATION === '1' ? describe : describe.skip

function adminDatabaseUrl() {
  if (process.env.DATABASE_ADMIN_URL) return process.env.DATABASE_ADMIN_URL
  const user = encodeURIComponent(process.env.POSTGRES_USER ?? 'opensymbols')
  const password = encodeURIComponent(process.env.POSTGRES_PASSWORD ?? 'opensymbols')
  const port = process.env.POSTGRES_PORT ?? '5432'
  return `postgresql://${user}:${password}@127.0.0.1:${port}/postgres`
}

databaseIntegration('PostgresPublicReadStore integration', () => {
  it('reads decoded repository and symbol records from a disposable database', async () => {
    const databaseName = `opensymbols_store_test_${process.pid}_${Date.now()}`
    const admin = new Pool({ connectionString: adminDatabaseUrl() })
    let setup: Pool | undefined
    let store: ReturnType<typeof createPostgresPublicReadStore> | undefined

    try {
      await admin.query(`CREATE DATABASE "${databaseName}"`)
      const databaseUrl = new URL(adminDatabaseUrl())
      databaseUrl.pathname = `/${databaseName}`
      const connectionString = databaseUrl.toString()
      setup = new Pool({ connectionString })
      await setup.query(catalogSchemaSql)
      await setup.query(`
        CREATE TABLE app_users (
          clerk_user_id varchar PRIMARY KEY,
          created_at timestamp NOT NULL,
          deleted_at timestamp
        );
        CREATE TABLE characters (
          id uuid PRIMARY KEY,
          clerk_user_id varchar NOT NULL REFERENCES app_users(clerk_user_id) ON DELETE CASCADE,
          name varchar(80) NOT NULL,
          template_key varchar NOT NULL,
          template_version integer NOT NULL,
          configuration_version integer NOT NULL,
          settings jsonb NOT NULL DEFAULT '{}'::jsonb,
          revision integer NOT NULL DEFAULT 1,
          created_at timestamp NOT NULL,
          updated_at timestamp NOT NULL
        );
        CREATE INDEX index_characters_on_owner_and_updated_at
          ON characters (clerk_user_id, updated_at, id);
      `)
      await setup.query(`
        INSERT INTO catalog_migration_runs
          (id, snapshot_id, status, source_postgresql_version, source_fingerprint,
           source_counts, normalized_counts, started_at, completed_at)
        VALUES
          ('10000000-0000-4000-8000-000000000099', 'store-fixture', 'completed', '17',
           repeat('a', 64), '{}'::jsonb, '{}'::jsonb, now(), now());
        INSERT INTO catalog_repositories
          (id, migration_run_id, repo_key, name, active, protected, created_at, updated_at)
        VALUES
          (1, '10000000-0000-4000-8000-000000000099', 'demo', 'Database demo', true, false, now(), now()),
          (2, '10000000-0000-4000-8000-000000000099', 'private', 'Private', true, true, now(), now());
      `)
      await setup.query(`
        INSERT INTO catalog_symbols
          (id, migration_run_id, repository_id, symbol_key, name, row_enabled,
           settings_enabled, row_has_skin, settings_has_skin, row_unsafe,
           settings_unsafe, created_at, updated_at)
        SELECT
          value,
          '10000000-0000-4000-8000-000000000099',
          1,
          'page-' || value,
          'Page ' || value,
          true,
          true,
          value = 2,
          value = 2,
          value = 3,
          value = 3,
          now(), now()
        FROM generate_series(1, 61) AS value
      `)
      await setup.query(`
        INSERT INTO catalog_symbol_localizations
          (migration_run_id, symbol_id, locale, name, search_string, ordinal)
        SELECT '10000000-0000-4000-8000-000000000099', value, 'en',
               'Page ' || value, 'page symbol', 0
        FROM generate_series(1, 61) AS value;
        INSERT INTO catalog_symbols
          (id, migration_run_id, repository_id, symbol_key, name, row_enabled,
           settings_enabled, row_has_skin, settings_has_skin, row_unsafe,
           settings_unsafe, created_at, updated_at)
        VALUES
          (62, '10000000-0000-4000-8000-000000000099', 2, 'secret', 'Secret page',
           true, true, false, false, false, false, now(), now()),
          (100, '10000000-0000-4000-8000-000000000099', 1, 'hello', 'Hello',
           true, true, false, false, false, false, now(), now());
      `)

      store = createPostgresPublicReadStore({
        connectionString,
      })
      await expect(store.listRepositories()).resolves.toMatchObject([
        { repoKey: 'demo', settings: { name: 'Database demo', active: true, protected: false } },
        { repoKey: 'private', settings: { name: 'Private', active: true, protected: true } },
      ])
      await expect(store.findRepository('demo')).resolves.toMatchObject(
        { repoKey: 'demo', settings: { name: 'Database demo', active: true } },
      )
      await expect(store.findSymbol('demo', 'hello')).resolves.toMatchObject({
        id: 100,
        repoKey: 'demo',
        symbolKey: 'hello',
        enabled: true,
        hasSkin: false,
        unsafeResult: false,
        settings: { name: 'Hello', enabled: true },
      })

      const app = createApp({
        publicReadStore: store,
        publicDiscoveryStore: store,
        publicApiStore: store,
        publicApiTokenSigningKey: 'dedicated-public-api-signing-key',
        publicApiNow: () => new Date('2026-07-22T10:00:00.000Z'),
        publicApiNonce: (label) => label === 'external_source_token'
          ? 'integration-shared-secret'
          : '0123456789abcdef01234567',
      })
      const page = await app.request('/api/v1/repositories/demo/symbols')
      const pageBody = await page.json() as { symbols: unknown[]; meta: { next_url: string } }
      expect(page.status).toBe(200)
      expect(pageBody.symbols).toHaveLength(60)
      expect(pageBody.meta.next_url).toBe('/api/v1/repositories/demo/symbols?page=1')
      expect((await app.request('/api/v1/repositories/private/symbols')).status).toBe(404)

      const safeSearch = await (await app.request('/api/v1/symbols/search?q=page&safe=1')).json() as Array<{ symbol_key: string }>
      expect(safeSearch).toHaveLength(50)
      expect(safeSearch.some((symbol) => symbol.symbol_key === 'page-3')).toBe(false)
      const unsafeSearch = await (await app.request('/api/v1/symbols/search?q=page&safe=0&page=1')).json() as unknown[]
      expect(unsafeSearch.length).toBeGreaterThan(0)

      await Promise.all([
        store.addSymbolRequest('Bacon', 'First concurrent comment', '2026-07-22T10:00:00.000Z'),
        store.addSymbolRequest('Bacon', 'Second concurrent comment', '2026-07-22T10:00:01.000Z'),
      ])
      const requestRows = await setup?.query<{ vote_count: number; comments: number }>(
        `SELECT request.vote_count, count(comment.*)::int AS comments
         FROM catalog_symbol_requests request
         LEFT JOIN catalog_symbol_request_comments comment ON comment.request_id = request.id
         WHERE request.phrase = 'Bacon' AND request.locale = 'en'
         GROUP BY request.id`,
      )
      expect(requestRows?.rows).toHaveLength(1)
      expect(requestRows!.rows[0]).toEqual({ vote_count: 2, comments: 2 })

      const application = await app.request('/api/v2/generate_secret', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          org_name: 'Integration AAC',
          org_email: 'integration@example.com',
          org_purpose: 'Database API verification',
        }),
      })
      expect(application.status).toBe(200)
      await expect(application.json()).resolves.toEqual({ shared_secret: 'integration-shared-secret' })
      const sourceRows = await setup.query<{
        name: string; email: string; purpose: string; approved: boolean
      }>(
        `SELECT name, email, purpose, approved FROM catalog_api_clients
         WHERE shared_secret = 'integration-shared-secret'`,
      )
      expect(sourceRows.rows[0]).toEqual({
        name: 'Integration AAC',
        email: 'integration@example.com',
        purpose: 'Database API verification',
        approved: false,
      })

      const tokenResponse = await app.request('/api/v2/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ secret: 'integration-shared-secret' }),
      })
      const tokenBody = await tokenResponse.json() as { access_token: string; expires: string }
      expect(tokenResponse.status).toBe(200)
      expect(tokenBody.expires).toBe('2026-07-23T10:00:00Z')
      const authorized = await app.request('/api/v2/symbols?q=page&safe=1&locale=es&page=0', {
        headers: { Authorization: tokenBody.access_token },
      })
      const authorizedBody = await authorized.json() as Array<{
        locale: string
        repo_key: string
        symbol_key: string
      }>
      expect(authorized.status).toBe(200)
      expect(authorizedBody).toHaveLength(50)
      expect(authorizedBody.every((symbol) => symbol.locale === 'es' && symbol.repo_key === 'demo')).toBe(true)
      expect(authorizedBody.some((symbol) => symbol.symbol_key === 'page-3')).toBe(false)

      const characterWrite = {
        name: 'Alex',
        templateKey: 'base-character-prototype',
        templateVersion: 1,
        configurationVersion: 1,
        settings: { skinColour: 'medium' as const, hairColour: 'brown' as const, shirtColour: 'blue' as const },
      }
      const firstCharacter = await store.createCharacter(
        'user_alex',
        '10000000-0000-4000-8000-000000000001',
        characterWrite,
        '2026-08-03T12:00:00.000Z',
      )
      expect(firstCharacter).toMatchObject({ kind: 'ok', character: { name: 'Alex', revision: 1 } })
      await store.createCharacter(
        'user_alex',
        '10000000-0000-4000-8000-000000000002',
        { ...characterWrite, name: 'Sam', settings: { skinColour: 'dark', hairColour: 'grey', shirtColour: 'red' } },
        '2026-08-03T13:00:00.000Z',
      )
      await expect(store.listCharacters('user_alex', '2026-08-03T14:00:00.000Z')).resolves.toMatchObject({
        kind: 'ok',
        characters: [{ name: 'Sam' }, { name: 'Alex' }],
      })
      await setup.query(`
        INSERT INTO characters
          (id, clerk_user_id, name, template_key, template_version,
           configuration_version, settings, revision, created_at, updated_at)
        VALUES
          ('10000000-0000-4000-8000-000000000003', 'user_alex', 'Legacy',
           'base-character-prototype', 1, 1, '{"skinColour":"medium"}'::jsonb, 1,
           '2026-08-03T12:00:00.000Z', '2026-08-03T12:00:00.000Z')
      `)
      await expect(store.findCharacter(
        'user_alex',
        '10000000-0000-4000-8000-000000000003',
        '2026-08-03T14:00:00.000Z',
      )).resolves.toMatchObject({ kind: 'ok', character: { settings: { hairColour: 'original', shirtColour: 'original' } } })
      await expect(store.findCharacter(
        'user_other',
        '10000000-0000-4000-8000-000000000001',
        '2026-08-03T14:00:00.000Z',
      )).resolves.toEqual({ kind: 'not_found' })

      const concurrentUpdates = await Promise.all([
        store.updateCharacter(
          'user_alex',
          '10000000-0000-4000-8000-000000000001',
          { ...characterWrite, name: 'Alex one' },
          1,
          '2026-08-03T14:00:00.000Z',
        ),
        store.updateCharacter(
          'user_alex',
          '10000000-0000-4000-8000-000000000001',
          { ...characterWrite, name: 'Alex two' },
          1,
          '2026-08-03T14:00:01.000Z',
        ),
      ])
      expect(concurrentUpdates.map((result) => result.kind).sort()).toEqual(['conflict', 'ok'])
      await expect(store.deleteCharacter(
        'user_other',
        '10000000-0000-4000-8000-000000000001',
        '2026-08-03T15:00:00.000Z',
      )).resolves.toEqual({ kind: 'not_found' })

      await setup.query(`
        CREATE FUNCTION fail_character_delete() RETURNS trigger AS $$
        BEGIN RAISE EXCEPTION 'delete blocked'; END;
        $$ LANGUAGE plpgsql;
        CREATE TRIGGER fail_character_delete BEFORE DELETE ON characters
        FOR EACH ROW EXECUTE FUNCTION fail_character_delete();
      `)
      await expect(store.deleteClerkUser('user_alex', '2026-08-03T16:00:00.000Z')).rejects.toThrow()
      const rolledBack = await setup.query<{ deleted_at: string | null; count: string }>(`
        SELECT app_users.deleted_at, COUNT(characters.id)::text AS count
        FROM app_users LEFT JOIN characters USING (clerk_user_id)
        WHERE app_users.clerk_user_id = 'user_alex'
        GROUP BY app_users.deleted_at
      `)
      expect(rolledBack.rows[0]).toMatchObject({ deleted_at: null, count: '3' })
      await setup.query('DROP TRIGGER fail_character_delete ON characters; DROP FUNCTION fail_character_delete();')

      await store.deleteClerkUser('user_alex', '2026-08-03T16:00:00.000Z')
      await store.deleteClerkUser('user_alex', '2026-08-03T16:00:01.000Z')
      await expect(store.listCharacters('user_alex', '2026-08-03T17:00:00.000Z')).resolves.toEqual({
        kind: 'account_deleted',
      })
      const deletedCharacterCount = await setup.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM characters WHERE clerk_user_id = 'user_alex'",
      )
      expect(deletedCharacterCount.rows[0]?.count).toBe('0')
    } finally {
      await setup?.end()
      await store?.close()
      await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`)
      await admin.end()
    }
  }, 30_000)
})
