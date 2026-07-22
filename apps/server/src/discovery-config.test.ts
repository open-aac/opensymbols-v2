import { describe, expect, it } from 'vitest'
import { discoveryCatalogFromEnvironment } from './discovery-config.js'
import type { PublicDiscoveryStore } from './public-read-store.js'

const store = {} as PublicDiscoveryStore

describe('discovery provider configuration', () => {
  it('defaults to PostgreSQL', () => {
    expect(discoveryCatalogFromEnvironment(store, {}, {}).provider).toBe('postgres')
  })

  it('creates an explicitly configured Meilisearch catalog', () => {
    expect(discoveryCatalogFromEnvironment(store, {}, {
      DISCOVERY_PROVIDER: 'meilisearch',
      MEILISEARCH_HOST: 'https://example.test',
      MEILISEARCH_SEARCH_API_KEY: 'search-only',
    }).provider).toBe('meilisearch')
  })

  it('fails fast for missing or malformed provider configuration', () => {
    expect(() => discoveryCatalogFromEnvironment(store, {}, {
      DISCOVERY_PROVIDER: 'meilisearch',
    })).toThrow('MEILISEARCH_HOST is required')
    expect(() => discoveryCatalogFromEnvironment(store, {}, {
      DISCOVERY_PROVIDER: 'meilisearch',
      MEILISEARCH_HOST: 'https://example.test',
    })).toThrow('MEILISEARCH_SEARCH_API_KEY is required')
    expect(() => discoveryCatalogFromEnvironment(store, {}, {
      DISCOVERY_PROVIDER: 'unknown',
    })).toThrow('DISCOVERY_PROVIDER must be postgres or meilisearch')
  })
})
