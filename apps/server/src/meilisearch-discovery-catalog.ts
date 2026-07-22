import type {
  DiscoveryCatalog,
  DiscoverySearchOptions,
  RepositorySymbolOptions,
} from './discovery-catalog.js'
import { CatalogUnavailableError } from './discovery-catalog.js'
import type { PublicSearchSymbol, RepositorySymbolsResult } from './public-discovery-api.js'
import type { PublicRepository, PublicSymbol } from './public-read-types.js'

const SEARCH_PAGE_SIZE = 50
const REPOSITORY_PAGE_SIZE = 60

export interface MeilisearchDiscoveryConfig {
  host: string
  searchApiKey: string
  symbolIndex?: string
  repositoryIndex?: string
  timeoutMs?: number
}

interface MeilisearchRepository {
  repoKey: string
  name: string
  description: string
  active: boolean
  protected: boolean
  license: string | null
  licenseUrl: string | null
  author: string | null
  authorUrl: string | null
  url: string | null
  symbolCount: number
}

interface MeilisearchSymbol {
  id: string
  symbolId: number
  symbolKey: string
  repoKey: string
  locale: string
  safe: boolean
  visible: boolean
  name: string
  description: string
  englishName: string
  searchTerms: string[]
  synonyms: string[]
  keywordBoosts: Array<{ term: string; weight: number }>
  imageUrl: string
  enabled: boolean
  protected: boolean
  hasSkin: boolean
  hasVariants: boolean
  license: string | null
  licenseUrl: string | null
  author: string | null
  authorUrl: string | null
  sourceUrl: string | null
  extension: string | null
  _rankingScore?: number
}

interface SearchResponse<T> {
  hits?: T[]
  estimatedTotalHits?: number
  totalHits?: number
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[.()/]/g, ' ').replace(/\s+/g, ' ').trim()
}

function normalizedLocale(value: string | undefined) {
  const locale = normalize(value || 'en').replace('_', '-')
  if (locale === 'zh' || locale.startsWith('zh-')) return 'zh-CN'
  return locale.split('-')[0] || 'en'
}

function extractFilter(query: string, name: 'repo' | 'favor') {
  const match = query.match(new RegExp(`(?:^|\\s)${name}:([\\w-]+)`, 'i'))
  return {
    value: match?.[1]?.toLowerCase(),
    query: match
      ? `${query.slice(0, match.index)} ${query.slice((match.index ?? 0) + match[0].length)}`
      : query,
  }
}

function quotedFilter(value: string) {
  return JSON.stringify(value)
}

function syntheticImageUrl(document: MeilisearchSymbol) {
  const original = document.imageUrl
  if (!original.startsWith('https://assets.example.invalid/')) return original
  const suffix = document.hasSkin && document.hasVariants
    ? `${String(document.symbolId).padStart(7, '0')}-varianted-skin.svg`
    : `${String(document.symbolId).padStart(7, '0')}.svg`
  return `/api/synthetic-images/${suffix}`
}

function publicSymbol(document: MeilisearchSymbol, locale = document.locale): PublicSymbol {
  return {
    id: document.symbolId,
    symbol_key: document.symbolKey,
    name: document.name || document.englishName || null,
    description: document.description || null,
    locale,
    license: document.license,
    license_url: document.licenseUrl,
    enabled: document.enabled,
    author: document.author,
    author_url: document.authorUrl,
    source_url: document.sourceUrl,
    repo_key: document.repoKey,
    hc: /\bhc\b/.test(document.description),
    protected_symbol: document.protected,
    extension: document.extension,
    image_url: syntheticImageUrl(document),
    search_string: [...document.searchTerms, ...document.synonyms].join(' '),
    unsafe_result: !document.safe,
    skins: document.hasSkin && document.hasVariants,
    _href: `/api/v1/symbols/${document.repoKey}/${document.symbolKey}?id=${document.symbolId}`,
    details_url: `/symbols/${document.repoKey}/${document.symbolKey}?id=${document.symbolId}`,
  }
}

function publicRepository(repository: MeilisearchRepository): PublicRepository {
  return {
    repo_key: repository.repoKey,
    name: repository.name,
    description: repository.description,
    url: repository.url,
    symbol_count: repository.symbolCount,
    logo_url: `/repositories/${repository.repoKey}.png`,
    attribution: {
      license: repository.license,
      license_url: repository.licenseUrl,
      author_name: repository.author,
      author_url: repository.authorUrl,
    },
  }
}

export class MeilisearchDiscoveryCatalog implements DiscoveryCatalog {
  readonly provider = 'meilisearch' as const
  private readonly host: string
  private readonly symbolIndex: string
  private readonly repositoryIndex: string
  private readonly timeoutMs: number

  constructor(
    private readonly config: MeilisearchDiscoveryConfig,
    private readonly request: typeof fetch = fetch,
    private readonly random: () => number = Math.random,
  ) {
    this.host = config.host.replace(/\/$/, '')
    if (!/^https?:\/\//.test(this.host)) throw new Error('MEILISEARCH_HOST must be an HTTP(S) URL')
    if (!config.searchApiKey.trim()) throw new Error('MEILISEARCH_SEARCH_API_KEY is required')
    this.symbolIndex = config.symbolIndex || 'symbols'
    this.repositoryIndex = config.repositoryIndex || 'repositories'
    this.timeoutMs = config.timeoutMs ?? 5_000
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 1) {
      throw new Error('MEILISEARCH_TIMEOUT_MS must be a positive integer')
    }
  }

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    try {
      const response = await this.request(`${this.host}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.config.searchApiKey}`,
          'Content-Type': 'application/json',
          ...init.headers,
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      })
      const body = await response.text()
      if (!response.ok) {
        throw new CatalogUnavailableError(`Meilisearch returned ${response.status}: ${body.slice(0, 200)}`)
      }
      return (body ? JSON.parse(body) : {}) as T
    } catch (error) {
      if (error instanceof CatalogUnavailableError) throw error
      throw new CatalogUnavailableError('Meilisearch request failed', { cause: error })
    }
  }

  private search<T>(index: string, body: Record<string, unknown>) {
    return this.call<SearchResponse<T>>(`/indexes/${encodeURIComponent(index)}/search`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  }

  async health() {
    await this.call('/health')
  }

  async listRepositories() {
    const result = await this.search<MeilisearchRepository>(this.repositoryIndex, {
      q: '',
      limit: 24,
      filter: ['active = true', 'protected = false'],
      sort: ['name:asc'],
    })
    return (result.hits ?? []).map(publicRepository)
  }

  async findRepository(repoKey: string) {
    const result = await this.search<MeilisearchRepository>(this.repositoryIndex, {
      q: '',
      limit: 1,
      filter: [`repoKey = ${quotedFilter(repoKey)}`, 'active = true', 'protected = false'],
    })
    const repository = result.hits?.[0]
    return repository ? publicRepository(repository) : null
  }

  async findSymbol(repoKey: string, symbolKey: string) {
    const result = await this.search<MeilisearchSymbol>(this.symbolIndex, {
      q: '',
      limit: 1,
      filter: [
        `repoKey = ${quotedFilter(repoKey)}`,
        `symbolKey = ${quotedFilter(symbolKey)}`,
        'locale = "en"',
        'visible = true',
      ],
    })
    const symbol = result.hits?.[0]
    return symbol
      ? { kind: 'found' as const, symbol: publicSymbol(symbol, 'en') }
      : { kind: 'not_found' as const, id: `${repoKey}/${symbolKey}` }
  }

  async randomSymbols() {
    const countResult = await this.search<MeilisearchSymbol>(this.symbolIndex, {
      q: '', limit: 0, filter: ['locale = "en"', 'visible = true', 'safe = true'],
    })
    const total = countResult.estimatedTotalHits ?? countResult.totalHits ?? 0
    if (!total) return []
    const offset = Math.floor(this.random() * Math.max(1, total - 8))
    const result = await this.search<MeilisearchSymbol>(this.symbolIndex, {
      q: '', limit: 9, offset, sort: ['symbolId:asc'],
      filter: ['locale = "en"', 'visible = true', 'safe = true'],
    })
    return (result.hits ?? []).map((symbol) => publicSymbol(symbol, 'en'))
  }

  async listRepositorySymbols(
    repoKey: string,
    options: RepositorySymbolOptions,
  ): Promise<RepositorySymbolsResult> {
    if (!await this.findRepository(repoKey)) return { kind: 'not_found' }
    const filter = [
      `repoKey = ${quotedFilter(repoKey)}`,
      'locale = "en"',
      'visible = true',
    ]
    if (options.unsafe) filter.push('safe = false')
    else if (options.hasSkin) filter.push('hasSkin = true')
    const result = await this.search<MeilisearchSymbol>(this.symbolIndex, {
      q: '',
      limit: REPOSITORY_PAGE_SIZE,
      offset: options.page * REPOSITORY_PAGE_SIZE,
      sort: ['symbolId:asc'],
      filter,
    })
    const total = result.estimatedTotalHits ?? result.totalHits ?? 0
    const symbols = (result.hits ?? []).map((symbol) => publicSymbol(symbol, 'en'))
    const consumed = options.page * REPOSITORY_PAGE_SIZE + symbols.length
    let nextUrl: string | undefined
    if (total > consumed) {
      const params = new URLSearchParams({ page: String(options.page + 1) })
      if (options.unsafe) params.set('unsafe', '1')
      else if (options.hasSkin) params.set('has_skin', '1')
      nextUrl = `/api/v1/repositories/${encodeURIComponent(repoKey)}/symbols?${params}`
    }
    return { kind: 'found', symbols, nextUrl }
  }

  async searchSymbols(options: DiscoverySearchOptions): Promise<PublicSearchSymbol[]> {
    const repoFilter = extractFilter(options.query, 'repo')
    const favorFilter = extractFilter(repoFilter.query, 'favor')
    const query = normalize(favorFilter.query)
    const locale = normalizedLocale(options.locale)
    const filter = ['visible = true']
    if (options.safe) filter.push('safe = true')
    if (repoFilter.value) filter.push(`repoKey = ${quotedFilter(repoFilter.value)}`)
    filter.push(locale === 'en' ? 'locale = "en"' : `(locale = ${quotedFilter(locale)} OR locale = "en")`)

    const desired = (options.page + 1) * SEARCH_PAGE_SIZE
    const result = await this.search<MeilisearchSymbol>(this.symbolIndex, {
      q: query,
      limit: Math.min(1_000, Math.max(100, desired * 2)),
      filter,
      showRankingScore: true,
    })
    const symbolOrder: number[] = []
    const symbolById = new Map<number, MeilisearchSymbol>()
    for (const symbol of result.hits ?? []) {
      const existing = symbolById.get(symbol.symbolId)
      if (!existing) symbolOrder.push(symbol.symbolId)
      if (!existing || (existing.locale !== locale && symbol.locale === locale)) {
        symbolById.set(symbol.symbolId, symbol)
      }
    }
    const candidates = symbolOrder.map((symbolId) => symbolById.get(symbolId)!)
    const repositoryCounts = new Map<string, number>()
    let ranked = candidates.map((symbol) => {
      const repositoryIndex = (repositoryCounts.get(symbol.repoKey) ?? 0) + 1
      repositoryCounts.set(symbol.repoKey, repositoryIndex)
      const boost = symbol.keywordBoosts.find((item) => normalize(item.term) === query)?.weight ?? 0
      return {
        symbol,
        useScore: boost,
        relevance: Math.round((symbol._rankingScore ?? 0) * 1_000) + boost,
        repositoryIndex: repositoryIndex <= 5 ? 2 : repositoryIndex <= 10 ? 1 : 0,
      }
    })

    if (favorFilter.value) {
      const favored = ranked.slice(0, 10)
        .filter((entry) => entry.symbol.repoKey.toLowerCase() === favorFilter.value)
      const favoredIds = new Set(favored.map((entry) => entry.symbol.symbolId))
      ranked = [...favored, ...ranked.filter((entry) => !favoredIds.has(entry.symbol.symbolId))]
    }

    return ranked
      .slice(options.page * SEARCH_PAGE_SIZE, desired)
      .map((entry) => ({
        ...publicSymbol(entry.symbol, locale),
        use_score: entry.useScore,
        relevance: entry.relevance,
        repo_index: entry.repositoryIndex,
      }))
  }

  async close() {}
}
