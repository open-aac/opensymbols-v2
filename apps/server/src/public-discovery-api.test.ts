import { describe, expect, it, vi } from 'vitest'
import { createApp } from './app.js'
import {
  listPublicRepositorySymbols,
  randomPublicSymbols,
  searchPublicSymbols,
} from './public-discovery-api.js'
import type { PublicDiscoveryStore } from './public-read-store.js'
import type { RepositoryRecord, SymbolRecord } from './public-read-types.js'

const repositories: RepositoryRecord[] = [
  { repoKey: 'demo', settings: { name: 'Demo', active: true } },
  { repoKey: 'other', settings: { name: 'Other', active: true } },
  { repoKey: 'private', settings: { name: 'Private', active: true, protected: true } },
]

function symbol(id: number, repoKey = 'demo', settings: SymbolRecord['settings'] = {}): SymbolRecord {
  return {
    id,
    repoKey,
    symbolKey: `symbol-${id}`,
    enabled: true,
    hasSkin: false,
    unsafeResult: false,
    settings: {
      name: `Symbol ${id}`,
      enabled: true,
      image_url: `/symbols/${id}.svg`,
      locales: { en: { name: `Symbol ${id}`, search_string: `symbol ${id}` } },
      ...settings,
    },
  }
}

function discoveryStore(symbols: SymbolRecord[]): PublicDiscoveryStore {
  return {
    async listRepositories() { return repositories },
    async findRepository(repoKey) {
      return repositories.find((repository) => repository.repoKey === repoKey) ?? null
    },
    async findSymbol(repoKey, symbolKey) {
      return symbols.find((item) => item.repoKey === repoKey && item.symbolKey === symbolKey) ?? null
    },
    async listSymbols() { return symbols },
    async listRepositorySymbols(repoKey) { return symbols.filter((item) => item.repoKey === repoKey) },
    addSymbolRequest: vi.fn().mockResolvedValue(undefined),
    async close() {},
  }
}

describe('public discovery behavior', () => {
  it('returns at most nine enabled, safe, public random symbols', async () => {
    const symbols = Array.from({ length: 12 }, (_, index) => symbol(index + 1))
    symbols.push(symbol(20, 'private'))
    symbols.push(symbol(21, 'demo', { unsafe_result: true }))
    symbols.push(symbol(22, 'demo', { protected_symbol: true }))
    symbols.push({ ...symbol(23), enabled: false })

    const result = await randomPublicSymbols(discoveryStore(symbols), {}, () => 0.5)

    expect(result).toHaveLength(9)
    expect(result.map((item) => item.id)).not.toEqual(expect.arrayContaining([20, 21, 22, 23]))
  })

  it('filters and paginates repository symbols with a same-origin next URL', async () => {
    const symbols = Array.from({ length: 61 }, (_, index) => symbol(index + 1))
    symbols[0] = { ...symbols[0]!, unsafeResult: true }
    const first = await listPublicRepositorySymbols(discoveryStore(symbols), 'demo', {
      page: 0,
      unsafe: false,
      hasSkin: false,
      image: {},
    })
    const unsafeOnly = await listPublicRepositorySymbols(discoveryStore(symbols), 'demo', {
      page: 0,
      unsafe: true,
      hasSkin: false,
      image: {},
    })

    expect(first.kind).toBe('found')
    if (first.kind === 'found') {
      expect(first.symbols).toHaveLength(60)
      expect(first.nextUrl).toBe('/api/v1/repositories/demo/symbols?page=1')
    }
    expect(unsafeOnly.kind === 'found' ? unsafeOnly.symbols.map((item) => item.id) : []).toEqual([1])
    await expect(listPublicRepositorySymbols(discoveryStore(symbols), 'private', {
      page: 0, unsafe: false, hasSkin: false, image: {},
    })).resolves.toEqual({ kind: 'not_found' })
  })

  it('searches decoded localized records with visibility, filters, and balancing', async () => {
    const symbols = [
      symbol(1, 'demo', { locales: { es: { name: 'Hola', search_string: 'saludo amable', use_scores: { hola: 4 } } } }),
      symbol(2, 'other', { name: 'Hola friend', locales: { en: { name: 'Hola friend' } } }),
      symbol(3, 'private', { name: 'Hola secret' }),
      symbol(4, 'demo', { name: 'Hola unsafe', unsafe_result: true }),
    ]

    const safe = await searchPublicSymbols(discoveryStore(symbols), {
      query: 'hola', locale: 'es-MX', safe: true, page: 0, image: {},
    })
    const repositoryOnly = await searchPublicSymbols(discoveryStore(symbols), {
      query: 'hola repo:other', locale: 'en', safe: false, page: 0, image: {},
    })

    expect(safe.map((item) => item.id)).toEqual([1, 2])
    expect(safe[0]).toMatchObject({ name: 'Hola', locale: 'es', use_score: 4, repo_index: 2 })
    expect(repositoryOnly.map((item) => item.id)).toEqual([2])
  })
})

describe('Hono public discovery routes', () => {
  it('owns all four routes and validates request submissions', async () => {
    const store = discoveryStore([symbol(1)])
    const app = createApp({ publicDiscoveryStore: store, legacyServerUrl: 'http://127.0.0.1:1' })

    expect((await app.request('/api/v1/symbols/random')).status).toBe(200)
    expect((await app.request('/api/v1/symbols/search?q=symbol')).status).toBe(200)
    expect((await app.request('/api/v1/repositories/demo/symbols')).status).toBe(200)
    expect((await app.request('/api/v1/repositories/private/symbols')).status).toBe(404)

    const valid = await app.request('/api/v1/symbols/requests', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: ' Bacon ', first_letter: 'b', comments: ' Clear image ' }),
    })
    const invalid = await app.request('/api/v1/symbols/requests', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Bacon', first_letter: 'x', comments: 'Clear image' }),
    })
    expect(valid.status).toBe(200)
    await expect(valid.json()).resolves.toEqual({ submitted: true })
    expect(store.addSymbolRequest).toHaveBeenCalledWith('Bacon', 'Clear image', expect.any(String))
    expect(invalid.status).toBe(422)
  })

  it.each([
    ['GET', '/api/v1/symbols/random'],
    ['GET', '/api/v1/symbols/search'],
    ['GET', '/api/v1/repositories/demo/symbols'],
    ['POST', '/api/v1/symbols/requests'],
  ])('returns a stable database error for %s %s', async (method, path) => {
    const store = discoveryStore([])
    store.listRepositories = async () => { throw new Error('private detail') }
    store.findRepository = async () => { throw new Error('private detail') }
    store.addSymbolRequest = async () => { throw new Error('private detail') }
    const response = await createApp({ publicDiscoveryStore: store }).request(path, {
      method,
      headers: { 'content-type': 'application/json' },
      body: method === 'POST'
        ? JSON.stringify({ name: 'Bacon', first_letter: 'b', comments: 'Clear' })
        : undefined,
    })
    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({ error: 'database_unavailable' })
  })
})
