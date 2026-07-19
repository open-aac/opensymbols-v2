import { Pool } from 'pg'
import { describe, expect, it } from 'vitest'
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
      `)
      await setup.query(
        'INSERT INTO symbol_repositories (repo_key, settings) VALUES ($1, $2)',
        ['demo', '**{"name":"Database demo","active":true}'],
      )
      await setup.query(
        `INSERT INTO picture_symbols
          (id, repo_key, symbol_key, settings, enabled, has_skin, unsafe_result)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [42, 'demo', 'hello', '**{"name":"Hello","enabled":true}', true, false, false],
      )
      await setup.end()
      setup = undefined

      store = createPostgresPublicReadStore({ connectionString })
      await expect(store.listRepositories()).resolves.toEqual([
        { repoKey: 'demo', settings: { name: 'Database demo', active: true } },
      ])
      await expect(store.findRepository('demo')).resolves.toEqual(
        { repoKey: 'demo', settings: { name: 'Database demo', active: true } },
      )
      await expect(store.findSymbol('demo', 'hello')).resolves.toEqual({
        id: 42,
        repoKey: 'demo',
        symbolKey: 'hello',
        enabled: true,
        hasSkin: false,
        unsafeResult: false,
        settings: { name: 'Hello', enabled: true },
      })
    } finally {
      await setup?.end()
      await store?.close()
      await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`)
      await admin.end()
    }
  }, 30_000)
})
