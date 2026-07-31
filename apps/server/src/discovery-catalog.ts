import {
  findPublicRepository,
  findPublicSymbol,
  listPublicRepositories,
  type PublicReadImageOptions,
  type PublicSymbolResult,
} from './public-read-api.js'
import {
  listPublicRepositorySymbols,
  randomPublicSymbols,
  searchPublicSymbols,
  type PublicSearchSymbol,
  type RepositorySymbolsResult,
} from './public-discovery-api.js'
import type { PublicDiscoveryStore } from './public-read-store.js'
import type { PublicRepository, PublicSymbol } from './public-read-types.js'

export interface DiscoverySearchOptions {
  query: string
  locale?: string
  safe: boolean
  page: number
}

export interface RepositorySymbolOptions {
  page: number
  unsafe: boolean
  hasSkin: boolean
}

export interface DiscoveryCatalog {
  readonly provider: 'postgres' | 'meilisearch'
  health(): Promise<void>
  listRepositories(): Promise<PublicRepository[]>
  findRepository(repoKey: string): Promise<PublicRepository | null>
  findSymbol(repoKey: string, symbolKey: string): Promise<PublicSymbolResult>
  randomSymbols(): Promise<PublicSymbol[]>
  listRepositorySymbols(repoKey: string, options: RepositorySymbolOptions): Promise<RepositorySymbolsResult>
  searchSymbols(options: DiscoverySearchOptions): Promise<PublicSearchSymbol[]>
  close(): Promise<void>
}

export class CatalogUnavailableError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'CatalogUnavailableError'
  }
}

export class PostgresDiscoveryCatalog implements DiscoveryCatalog {
  readonly provider = 'postgres' as const

  constructor(
    private readonly store: PublicDiscoveryStore,
    private readonly imageOptions: PublicReadImageOptions = {},
  ) {}

  async health() {
    await this.store.listRepositories()
  }

  listRepositories() {
    return listPublicRepositories(this.store)
  }

  findRepository(repoKey: string) {
    return findPublicRepository(this.store, repoKey)
  }

  findSymbol(repoKey: string, symbolKey: string) {
    return findPublicSymbol(this.store, repoKey, symbolKey, this.imageOptions)
  }

  randomSymbols() {
    return randomPublicSymbols(this.store, this.imageOptions)
  }

  listRepositorySymbols(repoKey: string, options: RepositorySymbolOptions) {
    return listPublicRepositorySymbols(this.store, repoKey, {
      ...options,
      image: this.imageOptions,
    })
  }

  searchSymbols(options: DiscoverySearchOptions) {
    return searchPublicSymbols(this.store, { ...options, image: this.imageOptions })
  }

  async close() {}
}
