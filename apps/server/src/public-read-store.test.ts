import type { QueryResultRow } from 'pg'
import { describe, expect, it, vi } from 'vitest'
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

const repository = {
  repo_key: 'demo', name: 'Demo', description: null, website_url: 'https://example.test',
  active: true, protected: false, repository_type: 'symbols', symbol_count: 12,
  protected_symbol_count: 10, attribution_license: 'CC-BY',
  attribution_license_url: null, attribution_author_name: 'Artist', attribution_author_url: null,
}

const symbol = {
  id: '42', repo_key: 'demo', symbol_key: 'hello', name: 'Hello', description: null,
  row_enabled: true, settings_enabled: true, row_has_skin: false, settings_has_skin: false,
  has_variants: false, row_unsafe: false, settings_unsafe: false, protected: false,
  protected_symbol: false, image_url: '/hello.svg', file_extension: 'svg', license: 'CC-BY',
  license_url: null, author: 'Artist', author_url: null, source_url: null, search_string: null,
  locales: { en: { name: 'Hello', description: null, search_string: 'hello greeting', use_scores: { hello: 3 } } },
}

const client = {
  id: '8', shared_secret: 'shared-secret', name: 'AAC Example', email: null, purpose: null,
  organization: null, organization_url: null, website_url: null, twitter: null,
  approved: false, full_access: false, global_token: false,
}

describe('PostgresPublicReadStore', () => {
  it('maps normalized repository rows and uses a parameterized lookup', async () => {
    const { database, query } = mockDatabase([repository], [repository])
    const store = new PostgresPublicReadStore(database)

    await expect(store.listRepositories()).resolves.toEqual([{
      repoKey: 'demo',
      settings: {
        name: 'Demo', description: null, url: 'https://example.test', active: true,
        protected: false, repository_type: 'symbols', n_symbols: 12,
        n_protected_symbols: 10,
        default_attribution: {
          license: 'CC-BY', license_url: null, author_name: 'Artist', author_url: null,
        },
      },
    }])
    await expect(store.findRepository('demo')).resolves.toMatchObject({ repoKey: 'demo' })
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining('catalog_repositories'), ['demo'])
  })

  it('maps normalized symbol and localization rows and returns null for a missing key', async () => {
    const { database, query } = mockDatabase([symbol], [])
    const store = new PostgresPublicReadStore(database)

    await expect(store.findSymbol('demo', 'hello')).resolves.toMatchObject({
      id: 42, repoKey: 'demo', symbolKey: 'hello', enabled: true,
      hasSkin: false, unsafeResult: false,
      settings: {
        name: 'Hello', enabled: true, image_url: '/hello.svg',
        locales: { en: { name: 'Hello', search_string: 'hello greeting', use_scores: { hello: 3 } } },
      },
    })
    await expect(store.findSymbol('demo', 'missing')).resolves.toBeNull()
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining('s.symbol_key = $2'), ['demo', 'missing'])
  })

  it('lists all and repository symbols from normalized tables', async () => {
    const { database, query } = mockDatabase([symbol], [symbol])
    const store = new PostgresPublicReadStore(database)

    await expect(store.listSymbols()).resolves.toHaveLength(1)
    await expect(store.listRepositorySymbols('demo')).resolves.toHaveLength(1)
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining('r.repo_key = $1'), ['demo'])
  })

  it('locks a phrase and creates a normalized request and comment', async () => {
    const { database, query } = mockDatabase([], [], [{ id: '9', vote_count: 1 }], [{ ordinal: 0 }], [])
    const store = new PostgresPublicReadStore(database)

    await store.addSymbolRequest('Bacon', 'Clear picture', '2026-07-22T10:00:00.000Z')

    expect(query.mock.calls[0]?.[0]).toContain('pg_advisory_xact_lock')
    expect(query.mock.calls[2]?.[0]).toContain('INSERT INTO catalog_symbol_requests')
    expect(query.mock.calls[4]?.[0]).toContain('INSERT INTO catalog_symbol_request_comments')
    expect(query.mock.calls[4]?.[1]).toEqual(['9', 0, 'Clear picture', '2026-07-22T10:00:00.000Z'])
  })

  it('appends to an existing request without losing comments', async () => {
    const { database, query } = mockDatabase(
      [], [{ id: '7', vote_count: 1 }], [], [{ ordinal: 1 }], [],
    )
    const store = new PostgresPublicReadStore(database)

    await store.addSymbolRequest('Bacon', 'Second', '2026-07-22T10:00:00.000Z')

    expect(query.mock.calls[2]?.[0]).toContain('UPDATE catalog_symbol_requests')
    expect(query.mock.calls[4]?.[1]).toEqual(['7', 1, 'Second', '2026-07-22T10:00:00.000Z'])
  })

  it('creates and finds normalized API clients with parameterized queries', async () => {
    const { database, query } = mockDatabase([client], [client], [client])
    const store = new PostgresPublicReadStore(database)

    await expect(store.createExternalSource('shared-secret', {
      name: 'AAC Example', approved: false,
    }, '2026-07-22T10:00:00.000Z')).resolves.toMatchObject({
      id: 8, token: 'shared-secret', settings: { name: 'AAC Example', approved: false },
    })
    expect(query.mock.calls[0]?.[0]).toContain('INSERT INTO catalog_api_clients')
    await expect(store.findExternalSourceByToken('shared-secret')).resolves.toMatchObject({ id: 8 })
    expect(query.mock.calls[1]?.[1]).toEqual(['shared-secret'])
    await expect(store.findExternalSourceById(8)).resolves.toMatchObject({ token: 'shared-secret' })
    expect(query.mock.calls[2]?.[1]).toEqual([8])
  })

  it('closes its injected database resource', async () => {
    const close = vi.fn().mockResolvedValue(undefined)
    const database: DatabaseClient = { query: vi.fn(), transaction: vi.fn() }
    const store = new PostgresPublicReadStore(database, close)

    await store.close()

    expect(close).toHaveBeenCalledOnce()
  })
})
