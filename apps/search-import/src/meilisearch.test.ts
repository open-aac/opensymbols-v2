import { describe, expect, it, vi } from 'vitest'
import { MeilisearchImportClient, MeilisearchImportError } from './meilisearch.js'
import type { SearchDocument } from './types.js'

const document: SearchDocument = {
  id: '1_en', symbolId: 1, symbolKey: 'symbol-0000001', repoKey: 'core-aac',
  locale: 'en', safe: true, visible: true, name: 'hello', description: 'A greeting',
  englishName: 'hello', englishDescription: 'A greeting', searchTerms: ['hello'], synonyms: ['hi'],
  keywordBoosts: [{ term: 'hello', weight: 2 }], text: 'hello\nA greeting\nhi',
  imageUrl: 'https://assets.example.invalid/symbols/0000001.svg', enabled: true,
  protected: false, hasSkin: true, hasVariants: true, license: 'CC0-1.0',
  licenseUrl: null, author: 'OpenSymbols', authorUrl: null, sourceUrl: null,
  extension: 'svg',
}

describe('Meilisearch import client', () => {
  it('uploads enriched documents idempotently by primary key', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ taskUid: 7 }), { status: 202 }),
    )
    await new MeilisearchImportClient({
      host: 'https://example.test', adminApiKey: 'secret',
    }, request).uploadSymbols([document])
    expect(request.mock.calls[0]![0]).toBe(
      'https://example.test/indexes/symbols/documents?primaryKey=id',
    )
    expect(JSON.parse(String(request.mock.calls[0]![1]!.body))).toEqual([document])
  })

  it('marks quotas and provider failures as resumable', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response('quota reached', { status: 429 }))
    const importer = new MeilisearchImportClient({
      host: 'https://example.test', adminApiKey: 'secret',
    }, request)
    await expect(importer.stats('symbols')).rejects.toMatchObject({
      status: 429, retryable: true,
    } satisfies Partial<MeilisearchImportError>)
  })

  it('uploads candidates with build metadata', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ taskUid: 8 }), { status: 202 }),
    )
    await new MeilisearchImportClient({
      host: 'https://example.test', adminApiKey: 'index-key',
    }, request).uploadSymbolsTo('symbols_candidate_abc', [document], 'opensymbols:abc:1_en')
    expect(request.mock.calls[0]![0]).toBe(
      'https://example.test/indexes/symbols_candidate_abc/documents?primaryKey=id&customMetadata=opensymbols%3Aabc%3A1_en',
    )
  })

  it('swaps both index pairs in one atomic task', async () => {
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ taskUid: 9 }), { status: 202 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'succeeded' }), { status: 200 }))
    const importer = new MeilisearchImportClient({
      host: 'https://example.test', adminApiKey: 'index-key',
    }, request)
    await importer.swapIndexes([
      ['symbols', 'symbols_candidate_abc'],
      ['repositories', 'repositories_candidate_abc'],
    ])
    expect(request.mock.calls[0]![0]).toBe('https://example.test/swap-indexes')
    expect(JSON.parse(String(request.mock.calls[0]![1]!.body))).toEqual([
      { indexes: ['symbols', 'symbols_candidate_abc'] },
      { indexes: ['repositories', 'repositories_candidate_abc'] },
    ])
  })
})
