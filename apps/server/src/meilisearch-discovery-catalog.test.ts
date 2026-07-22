import { describe, expect, it, vi } from 'vitest'
import { CatalogUnavailableError } from './discovery-catalog.js'
import { MeilisearchDiscoveryCatalog } from './meilisearch-discovery-catalog.js'

function symbol(overrides: Record<string, unknown> = {}) {
  return {
    id: '1_en', symbolId: 1, symbolKey: 'symbol-0000001', repoKey: 'core-aac',
    locale: 'en', safe: true, visible: true, name: 'hello', description: 'A greeting',
    englishName: 'hello', englishDescription: 'A greeting', searchTerms: ['hello'], synonyms: ['hi'],
    keywordBoosts: [{ term: 'hello', weight: 2 }],
    imageUrl: 'https://assets.example.invalid/symbols/0000001.svg', enabled: true,
    protected: false, hasSkin: true, hasVariants: true, license: 'CC0-1.0',
    licenseUrl: null, author: 'OpenSymbols', authorUrl: null, sourceUrl: null,
    extension: 'svg', _rankingScore: 0.9, ...overrides,
  }
}

function catalog(responses: unknown[]) {
  const request = vi.fn<typeof fetch>()
  for (const response of responses) {
    request.mockResolvedValueOnce(new Response(JSON.stringify(response), { status: 200 }))
  }
  return {
    value: new MeilisearchDiscoveryCatalog({
      host: 'https://example.test', searchApiKey: 'search-only',
    }, request, () => 0),
    request,
  }
}

describe('Meilisearch discovery catalog', () => {
  it('maps public repositories and hides provider response shapes', async () => {
    const { value, request } = catalog([{ hits: [{
      repoKey: 'core-aac', name: 'Core', description: 'AAC', active: true,
      protected: false, license: 'CC0-1.0', licenseUrl: null,
      author: 'OpenSymbols', authorUrl: null, url: null, symbolCount: 198,
    }] }])
    await expect(value.listRepositories()).resolves.toEqual([expect.objectContaining({
      repo_key: 'core-aac', name: 'Core', symbol_count: 198,
    })])
    const body = JSON.parse(String(request.mock.calls[0]![1]!.body))
    expect(body.filter).toEqual(['active = true', 'protected = false'])
    expect(body.limit).toBe(1_000)
  })

  it('fetches every public repository rather than assuming the synthetic repository count', async () => {
    const repository = (index: number) => ({
      repoKey: `repo-${index}`, name: `Repository ${index}`, description: '', active: true,
      protected: false, license: null, licenseUrl: null, author: null,
      authorUrl: null, url: null, symbolCount: 1,
    })
    const { value, request } = catalog([
      { hits: Array.from({ length: 1_000 }, (_, index) => repository(index)) },
      { hits: [repository(1_000)] },
    ])
    await expect(value.listRepositories()).resolves.toHaveLength(1_001)
    const body = JSON.parse(String(request.mock.calls[1]![1]!.body))
    expect(body.offset).toBe(1_000)
  })

  it('maps symbol detail and deterministic synthetic skin image URLs', async () => {
    const { value } = catalog([{ hits: [symbol()] }])
    await expect(value.findSymbol('core-aac', 'symbol-0000001')).resolves.toEqual({
      kind: 'found',
      symbol: expect.objectContaining({
        id: 1, locale: 'en', image_url: '/api/synthetic-images/0000001-varianted-skin.svg',
        skins: true, unsafe_result: false,
      }),
    })
  })

  it('derives hc from the English source description, not the requested localization', async () => {
    const { value } = catalog([{ hits: [symbol({
      description: 'Localized hc marker', englishDescription: 'A greeting',
    })] }])
    await expect(value.findSymbol('core-aac', 'symbol-0000001')).resolves.toMatchObject({
      kind: 'found', symbol: { hc: false },
    })
  })

  it('uses locale fallback and safe/repository filters while deduplicating symbols', async () => {
    const { value, request } = catalog([
      { hits: [
        symbol(),
        symbol({ id: '1_es', locale: 'es', name: 'hola' }),
        symbol({ id: '2_en', symbolId: 2, symbolKey: 'symbol-0000002' }),
      ], estimatedTotalHits: 3 },
      { hits: [symbol({ id: '1_es', locale: 'es', name: 'hola' })] },
    ])
    const results = await value.searchSymbols({
      query: 'hola repo:core-aac', locale: 'es-MX', safe: true, page: 0,
    })
    expect(results).toHaveLength(2)
    expect(results[0]).toMatchObject({ id: 1, locale: 'es', use_score: 0, relevance: 0.9 })
    const body = JSON.parse(String(request.mock.calls[0]![1]!.body))
    expect(body.q).toBe('hola')
    expect(body.filter).toContain('safe = true')
    expect(body.filter).toContain('repoKey = "core-aac"')
    expect(body.filter).toContain('(locale = "es" OR locale = "en")')
  })

  it('keeps the generated Simplified Chinese locale identifier', async () => {
    const { value, request } = catalog([
      { hits: [symbol({ locale: 'zh-CN', name: '你好' })], estimatedTotalHits: 1 },
      { hits: [symbol({ locale: 'zh-CN', name: '你好' })] },
    ])
    const results = await value.searchSymbols({
      query: '你好', locale: 'zh-CN', safe: true, page: 0,
    })
    expect(results[0]?.locale).toBe('zh-CN')
    const body = JSON.parse(String(request.mock.calls[0]![1]!.body))
    expect(body.filter).toContain('(locale = "zh-CN" OR locale = "en")')
  })

  it('does not treat Traditional Chinese as Simplified Chinese', async () => {
    const { value, request } = catalog([{ hits: [symbol()] }, { hits: [] }])
    const results = await value.searchSymbols({
      query: 'hello', locale: 'zh-TW', safe: true, page: 0,
    })
    expect(results[0]?.locale).toBe('zh')
    const body = JSON.parse(String(request.mock.calls[0]![1]!.body))
    expect(body.filter).toContain('(locale = "zh" OR locale = "en")')
  })

  it('continues fetching unique results beyond the first 1,000 localization hits', async () => {
    const firstBatch = Array.from({ length: 1_000 }, (_, index) =>
      symbol({ id: `${index + 1}_en`, symbolId: index + 1, symbolKey: `symbol-${index + 1}` }))
    const secondBatch = Array.from({ length: 100 }, (_, index) =>
      symbol({ id: `${index + 1001}_en`, symbolId: index + 1001, symbolKey: `symbol-${index + 1001}` }))
    const { value, request } = catalog([
      { hits: firstBatch, estimatedTotalHits: 1_100 },
      { hits: secondBatch, estimatedTotalHits: 1_100 },
    ])
    const results = await value.searchSymbols({ query: '', locale: 'en', safe: true, page: 20 })
    expect(results).toHaveLength(50)
    expect(results[0]?.id).toBe(1001)
    const secondBody = JSON.parse(String(request.mock.calls[1]![1]!.body))
    expect(secondBody.offset).toBe(1_000)
  })

  it('caps deep search pages before issuing provider requests', async () => {
    const { value, request } = catalog([])
    await expect(value.searchSymbols({ query: '', locale: 'en', safe: true, page: 100 }))
      .resolves.toEqual([])
    expect(request).not.toHaveBeenCalled()
  })

  it('samples random symbol IDs instead of requesting a contiguous estimated-total window', async () => {
    const sampled = Array.from({ length: 9 }, (_, index) =>
      symbol({ id: `${index + 1}_en`, symbolId: index + 1, symbolKey: `symbol-${index + 1}` }))
    const { value, request } = catalog([
      { hits: [symbol({ symbolId: 100, id: '100_en' })] },
      { hits: sampled },
    ])
    await expect(value.randomSymbols()).resolves.toHaveLength(9)
    const maximumBody = JSON.parse(String(request.mock.calls[0]![1]!.body))
    const sampleBody = JSON.parse(String(request.mock.calls[1]![1]!.body))
    expect(maximumBody.sort).toEqual(['symbolId:desc'])
    expect(sampleBody.filter).toContainEqual(expect.stringContaining('symbolId IN ['))
    expect(sampleBody.offset).toBeUndefined()
  })

  it('maps repository pagination and unsafe filtering', async () => {
    const { value, request } = catalog([
      { hits: [{ repoKey: 'core-aac', name: 'Core', description: '', active: true,
        protected: false, license: null, licenseUrl: null, author: null,
        authorUrl: null, url: null, symbolCount: 70 }] },
      { hits: Array.from({ length: 61 }, (_, index) => symbol({
        id: `${index + 1}_en`, symbolId: index + 1, symbolKey: `symbol-${index + 1}`,
        safe: false,
      })) },
    ])
    const result = await value.listRepositorySymbols('core-aac', {
      page: 0, unsafe: true, hasSkin: false,
    })
    expect(result).toMatchObject({ kind: 'found', nextUrl: expect.stringContaining('unsafe=1') })
    if (result.kind === 'found') expect(result.symbols).toHaveLength(60)
    const body = JSON.parse(String(request.mock.calls[1]![1]!.body))
    expect(body.filter).toContain('safe = false')
    expect(body.limit).toBe(61)
  })

  it('turns provider and transport failures into catalog unavailability', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response('down', { status: 503 }))
    const value = new MeilisearchDiscoveryCatalog({
      host: 'https://example.test', searchApiKey: 'search-only',
    }, request)
    await expect(value.health()).rejects.toBeInstanceOf(CatalogUnavailableError)
  })
})
