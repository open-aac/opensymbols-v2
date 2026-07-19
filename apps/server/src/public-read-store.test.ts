import type { QueryResultRow } from 'pg'
import { describe, expect, it, vi } from 'vitest'
import { PostgresPublicReadStore, type DatabaseClient } from './public-read-store.js'

function mockDatabase(...responses: QueryResultRow[][]) {
  const query = vi.fn(async (text: string, values?: unknown[]) => {
    void text
    void values
    return { rows: responses.shift() ?? [] }
  })
  const database: DatabaseClient = {
    async query<Row extends QueryResultRow>(text: string, values?: unknown[]) {
      const result = await query(text, values)
      return { rows: result.rows as Row[] }
    },
  }
  return { database, query }
}

describe('PostgresPublicReadStore', () => {
  it('decodes typed repository rows and uses a parameterized lookup', async () => {
    const { database, query } = mockDatabase(
      [{ repo_key: 'demo', settings: '**{"name":"Demo"}' }],
      [{ repo_key: 'demo', settings: '**{"name":"Demo"}' }],
    )
    const store = new PostgresPublicReadStore(database)

    await expect(store.listRepositories()).resolves.toEqual([
      { repoKey: 'demo', settings: { name: 'Demo' } },
    ])
    await expect(store.findRepository('demo')).resolves.toEqual(
      { repoKey: 'demo', settings: { name: 'Demo' } },
    )
    expect(query).toHaveBeenLastCalledWith(
      'SELECT repo_key, settings FROM symbol_repositories WHERE repo_key = $1 LIMIT 1',
      ['demo'],
    )
  })

  it('decodes a typed symbol row and returns null for a missing key', async () => {
    const { database, query } = mockDatabase(
      [{
          id: 42,
          repo_key: 'demo',
          symbol_key: 'hello',
          enabled: true,
          has_skin: false,
          unsafe_result: false,
          settings: '**{"name":"Hello","locales":{"en":{"name":"Hello"}}}',
      }],
      [],
    )
    const store = new PostgresPublicReadStore(database)

    await expect(store.findSymbol('demo', 'hello')).resolves.toEqual({
      id: 42,
      repoKey: 'demo',
      symbolKey: 'hello',
      enabled: true,
      hasSkin: false,
      unsafeResult: false,
      settings: { name: 'Hello', locales: { en: { name: 'Hello' } } },
    })
    await expect(store.findSymbol('demo', 'missing')).resolves.toBeNull()
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining('symbol_key = $2'), ['demo', 'missing'])
  })

  it('rejects null and non-object settings with a generic error', async () => {
    const { database } = mockDatabase(
      [{ repo_key: 'null', settings: null }],
      [{ repo_key: 'array', settings: '**[]' }],
    )
    const store = new PostgresPublicReadStore(database)

    await expect(store.findRepository('null')).rejects.toThrow('Unable to decode secure settings')
    await expect(store.findRepository('array')).rejects.toThrow('Unable to decode secure settings')
  })

  it('closes its injected database resource', async () => {
    const close = vi.fn().mockResolvedValue(undefined)
    const store = new PostgresPublicReadStore({ query: vi.fn() }, undefined, close)

    await store.close()

    expect(close).toHaveBeenCalledOnce()
  })
})
