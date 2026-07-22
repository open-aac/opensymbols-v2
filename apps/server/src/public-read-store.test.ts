import type { QueryResultRow } from 'pg'
import { describe, expect, it, vi } from 'vitest'
import { decodeGoSecure } from './go-secure.js'
import {
  PostgresPublicReadStore,
  type DatabaseClient,
  type DatabaseSession,
} from './public-read-store.js'

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
    async transaction<Result>(work: (session: DatabaseSession) => Promise<Result>) {
      return work(database)
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

  it('lists all and repository symbols using decoded PostgreSQL records', async () => {
    const row = {
      id: 42, repo_key: 'demo', symbol_key: 'hello', enabled: true,
      has_skin: false, unsafe_result: false, settings: '**{"name":"Hello"}',
    }
    const { database, query } = mockDatabase([row], [row])
    const store = new PostgresPublicReadStore(database)

    await expect(store.listSymbols()).resolves.toHaveLength(1)
    await expect(store.listRepositorySymbols('demo')).resolves.toHaveLength(1)
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining('WHERE repo_key = $1'), ['demo'])
  })

  it('locks a phrase and creates GoSecure-compatible request settings', async () => {
    const { database, query } = mockDatabase([], [], [])
    const store = new PostgresPublicReadStore(database)

    await store.addSymbolRequest('Bacon', 'Clear picture', '2026-07-22T10:00:00.000Z')

    expect(query.mock.calls[0]?.[0]).toContain('pg_advisory_xact_lock')
    const insert = query.mock.calls[2]
    expect(insert?.[0]).toContain('INSERT INTO symbol_requests')
    expect(decodeGoSecure(insert?.[1]?.[1] as string)).toEqual({
      comments: [{ user_id: null, text: 'Clear picture', timestamp: '2026-07-22T10:00:00.000Z' }],
      n_votes: 1,
    })
  })

  it('appends to an existing request without losing comments', async () => {
    const { database, query } = mockDatabase(
      [],
      [{ id: 7, settings: '**{"comments":[{"text":"First"}],"n_votes":1}' }],
      [],
    )
    const store = new PostgresPublicReadStore(database)

    await store.addSymbolRequest('Bacon', 'Second', '2026-07-22T10:00:00.000Z')

    const update = query.mock.calls[2]
    expect(update?.[0]).toContain('UPDATE symbol_requests')
    expect(decodeGoSecure(update?.[1]?.[0] as string)).toMatchObject({ n_votes: 2 })
  })

  it('creates and finds GoSecure-compatible external sources with parameterized queries', async () => {
    const row = {
      id: 8,
      token: 'shared-secret',
      settings: '**{"name":"AAC Example","approved":false}',
    }
    const { database, query } = mockDatabase([row], [row], [row])
    const store = new PostgresPublicReadStore(database)

    await expect(store.createExternalSource('shared-secret', {
      name: 'AAC Example', approved: false,
    }, '2026-07-22T10:00:00.000Z')).resolves.toEqual({
      id: 8, token: 'shared-secret', settings: { name: 'AAC Example', approved: false },
    })
    expect(query.mock.calls[0]?.[0]).toContain('INSERT INTO external_sources')
    expect(decodeGoSecure(query.mock.calls[0]?.[1]?.[1] as string)).toEqual({
      name: 'AAC Example', approved: false,
    })
    await expect(store.findExternalSourceByToken('shared-secret')).resolves.toMatchObject({ id: 8 })
    expect(query.mock.calls[1]?.[1]).toEqual(['shared-secret'])
    await expect(store.findExternalSourceById(8)).resolves.toMatchObject({ token: 'shared-secret' })
    expect(query.mock.calls[2]?.[1]).toEqual([8])
  })

  it('closes its injected database resource', async () => {
    const close = vi.fn().mockResolvedValue(undefined)
    const database: DatabaseClient = {
      query: vi.fn(),
      transaction: vi.fn(),
    }
    const store = new PostgresPublicReadStore(database, undefined, close)

    await store.close()

    expect(close).toHaveBeenCalledOnce()
  })
})
