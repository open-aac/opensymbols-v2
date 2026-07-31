import { describe, expect, it } from 'vitest'
import { normalizeLocale, searchDocumentsForSymbol } from './postgres-export.js'

describe('PostgreSQL search export transformation', () => {
  it('normalizes runtime locales consistently', () => {
    expect(normalizeLocale('es-MX')).toBe('es')
    expect(normalizeLocale('pt_BR')).toBe('pt')
    expect(normalizeLocale('zh-Hans-CN')).toBe('zh-CN')
    expect(normalizeLocale('ZH_cn')).toBe('zh-CN')
  })

  it('emits public localized documents with fallback, safety, boosts, and CDN URLs', () => {
    const defaults = new Map([['es\0hello', ['saludo']]])
    const documents = searchDocumentsForSymbol({
      id: 7,
      repo_key: 'demo',
      symbol_key: 'hello',
      enabled: null,
      has_skin: true,
      unsafe_result: true,
      settings: null,
    }, {
      name: 'Hello',
      description: 'English description',
      enabled: true,
      has_variants: true,
      image_url: '/libraries/demo/hello.svg',
      locales: {
        en: { name: 'Hello', search_string: 'hello greeting', use_scores: { hello: 99 } },
        'es-MX': { name: 'Hola', search_string: 'hola saludo', use_scores: { hola: 3 } },
      },
    }, defaults, { bucket: 'bucket', cdn: 'https://cdn.example.test/' })

    expect(documents.map((document) => document.locale)).toEqual(['en', 'es'])
    expect(documents[0]).toMatchObject({
      id: '7_en', safe: false, visible: true, enabled: true, protected: false,
      hasSkin: true, hasVariants: true, imageUrl: 'https://cdn.example.test/libraries/demo/hello.svg',
    })
    expect(documents[0]!.keywordBoosts).toContainEqual({ term: 'hello', weight: 10 })
    expect(documents[1]).toMatchObject({ name: 'Hola', englishName: 'Hello' })
    expect(documents[1]!.keywordBoosts).toEqual([
      { term: 'hola', weight: 3 },
      { term: 'saludo', weight: 5 },
    ])
  })

  it('resolves locale collisions deterministically in favor of the exact base locale', () => {
    const documents = searchDocumentsForSymbol({
      id: 8, repo_key: 'demo', symbol_key: 'word', enabled: true,
      has_skin: false, unsafe_result: false, settings: null,
    }, {
      name: 'Word',
      locales: {
        'fr-CA': { name: 'Canadien' },
        fr: { name: 'Français' },
      },
    }, new Map(), { bucket: 'bucket', cdn: 'https://cdn.example.test' })
    expect(documents.find((document) => document.locale === 'fr')?.name).toBe('Français')
  })
})
