import { describe, expect, it, vi } from 'vitest'
import { MeilisearchImportClient, MeilisearchImportError } from './meilisearch.js'
import type { SearchDocument } from './types.js'

const document: SearchDocument = {
  id: '1_en', symbolId: 1, symbolKey: 'symbol-0000001', repoKey: 'core-aac',
  locale: 'en', safe: true, visible: true, name: 'hello', description: 'A greeting',
  englishName: 'hello', searchTerms: ['hello'], synonyms: ['hi'],
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
})
