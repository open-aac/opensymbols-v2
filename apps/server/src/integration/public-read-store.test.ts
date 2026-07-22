import { Pool } from 'pg'
import { describe, expect, it } from 'vitest'
import { createApp } from '../app.js'
import { decodeGoSecure } from '../go-secure.js'
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
      await setup.query(`
        CREATE TABLE symbol_repositories (
          id serial PRIMARY KEY,
          repo_key varchar NOT NULL UNIQUE,
          settings text
        );
        CREATE TABLE picture_symbols (
          id serial PRIMARY KEY,
          repo_key varchar NOT NULL,
          symbol_key varchar NOT NULL,
          settings text,
          enabled boolean,
          has_skin boolean,
          unsafe_result boolean,
          UNIQUE (repo_key, symbol_key)
        );
        CREATE TABLE symbol_requests (
          id serial PRIMARY KEY,
          settings text,
          phrase varchar,
          locale varchar,
          created_at timestamp NOT NULL,
          updated_at timestamp NOT NULL
        );
        CREATE INDEX index_symbol_requests_on_locale_and_phrase
          ON symbol_requests (locale, phrase);
      `)
      await setup.query(
        'INSERT INTO symbol_repositories (repo_key, settings) VALUES ($1, $2)',
        ['demo', '**{"name":"Database demo","active":true}'],
      )
      await setup.query(
        'INSERT INTO symbol_repositories (repo_key, settings) VALUES ($1, $2)',
        ['private', '**{"name":"Private","active":true,"protected":true}'],
      )
      await setup.query(`
        INSERT INTO picture_symbols
          (repo_key, symbol_key, settings, enabled, has_skin, unsafe_result)
        SELECT
          'demo',
          'page-' || value,
          '**{"name":"Page ' || value || '","enabled":true,"locales":{"en":{"search_string":"page symbol"}}}',
          true,
          value = 2,
          value = 3
        FROM generate_series(1, 61) AS value
      `)
      await setup.query(
        `INSERT INTO picture_symbols
          (repo_key, symbol_key, settings, enabled, has_skin, unsafe_result)
         VALUES ('private', 'secret', '**{"name":"Secret page","enabled":true}', true, false, false)`,
      )
      await setup.query(
        `INSERT INTO picture_symbols
          (id, repo_key, symbol_key, settings, enabled, has_skin, unsafe_result)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [100, 'demo', 'hello', '**{"name":"Hello","enabled":true}', true, false, false],
      )

      store = createPostgresPublicReadStore({ connectionString })
      await expect(store.listRepositories()).resolves.toEqual([
        { repoKey: 'demo', settings: { name: 'Database demo', active: true } },
        { repoKey: 'private', settings: { name: 'Private', active: true, protected: true } },
      ])
      await expect(store.findRepository('demo')).resolves.toEqual(
        { repoKey: 'demo', settings: { name: 'Database demo', active: true } },
      )
      await expect(store.findSymbol('demo', 'hello')).resolves.toEqual({
        id: 100,
        repoKey: 'demo',
        symbolKey: 'hello',
        enabled: true,
        hasSkin: false,
        unsafeResult: false,
        settings: { name: 'Hello', enabled: true },
      })

      const app = createApp({ publicReadStore: store, publicDiscoveryStore: store })
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
      const requestRows = await setup?.query<{ settings: string }>(
        "SELECT settings FROM symbol_requests WHERE phrase = 'Bacon' AND locale = 'en'",
      )
      expect(requestRows?.rows).toHaveLength(1)
      expect(decodeGoSecure(requestRows!.rows[0]!.settings)).toMatchObject({ n_votes: 2 })
    } finally {
      await setup?.end()
      await store?.close()
      await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`)
      await admin.end()
    }
  }, 30_000)
})
