import type { DiscoveryCatalog } from './discovery-catalog.js'
import { PostgresDiscoveryCatalog } from './discovery-catalog.js'
import {
  MeilisearchDiscoveryCatalog,
  type MeilisearchDiscoveryConfig,
} from './meilisearch-discovery-catalog.js'
import type { PublicDiscoveryStore } from './public-read-store.js'
import type { PublicReadImageOptions } from './public-read-api.js'

export interface DiscoveryEnvironment {
  DISCOVERY_PROVIDER?: string
  MEILISEARCH_HOST?: string
  MEILISEARCH_SEARCH_API_KEY?: string
  MEILISEARCH_SYMBOL_INDEX?: string
  MEILISEARCH_REPOSITORY_INDEX?: string
  MEILISEARCH_TIMEOUT_MS?: string
}

function positiveInteger(value: string | undefined) {
  if (value === undefined) return undefined
  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error('MEILISEARCH_TIMEOUT_MS must be a positive integer')
  }
  return parsed
}

export function discoveryCatalogFromEnvironment(
  store: PublicDiscoveryStore,
  imageOptions: PublicReadImageOptions,
  environment: DiscoveryEnvironment = process.env,
): DiscoveryCatalog {
  const provider = environment.DISCOVERY_PROVIDER?.trim() || 'postgres'
  if (provider === 'postgres') return new PostgresDiscoveryCatalog(store, imageOptions)
  if (provider !== 'meilisearch') {
    throw new Error('DISCOVERY_PROVIDER must be postgres or meilisearch')
  }
  const config: MeilisearchDiscoveryConfig = {
    host: environment.MEILISEARCH_HOST?.trim() || '',
    searchApiKey: environment.MEILISEARCH_SEARCH_API_KEY?.trim() || '',
    symbolIndex: environment.MEILISEARCH_SYMBOL_INDEX?.trim() || undefined,
    repositoryIndex: environment.MEILISEARCH_REPOSITORY_INDEX?.trim() || undefined,
    timeoutMs: positiveInteger(environment.MEILISEARCH_TIMEOUT_MS),
  }
  if (!config.host) throw new Error('MEILISEARCH_HOST is required')
  return new MeilisearchDiscoveryCatalog(config)
}
