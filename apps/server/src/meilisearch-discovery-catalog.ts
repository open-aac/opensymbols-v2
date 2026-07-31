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
const MAX_SEARCH_PAGE = 99
const PROVIDER_BATCH_SIZE = 1_000

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
  englishDescription: string
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
  if (
    locale === 'zh-cn' ||
    locale === 'zh-sg' ||
    locale === 'zh-hans' ||
    locale.startsWith('zh-hans-')
  ) return 'zh-CN'
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
    hc: /\bhc\b/.test(document.englishDescription),
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
    await Promise.all([
      this.search(this.symbolIndex, { q: '', limit: 0 }),
      this.search(this.repositoryIndex, { q: '', limit: 0 }),
    ])
  }

  async listRepositories() {
    const repositories: MeilisearchRepository[] = []
    let offset = 0
    while (true) {
      const result = await this.search<MeilisearchRepository>(this.repositoryIndex, {
        q: '',
        limit: PROVIDER_BATCH_SIZE,
        offset,
        filter: ['active = true', 'protected = false'],
        sort: ['name:asc'],
      })
      const hits = result.hits ?? []
      repositories.push(...hits)
      if (hits.length < PROVIDER_BATCH_SIZE) break
      offset += hits.length
    }
    return repositories.map(publicRepository)
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
    const visibility = ['locale = "en"', 'visible = true', 'safe = true']
    const maximum = await this.search<MeilisearchSymbol>(this.symbolIndex, {
      q: '', limit: 1, sort: ['symbolId:desc'], filter: visibility,
    })
    const maximumSymbolId = maximum.hits?.[0]?.symbolId ?? 0
    if (!maximumSymbolId) return []

    const symbols = new Map<number, MeilisearchSymbol>()
    for (let attempt = 0; attempt < 4 && symbols.size < 9; attempt += 1) {
      const ids = new Set<number>()
      for (let index = 0; index < 27; index += 1) {
        const unit = Math.min(Math.max(this.random(), 0), 0.999999999)
        const randomId = Math.floor(unit * maximumSymbolId)
        ids.add(((randomId + attempt * 9_973 + index * 7_919) % maximumSymbolId) + 1)
      }
      const result = await this.search<MeilisearchSymbol>(this.symbolIndex, {
        q: '',
        limit: ids.size,
        filter: [...visibility, `symbolId IN [${[...ids].join(', ')}]`],
      })
      for (const symbol of result.hits ?? []) symbols.set(symbol.symbolId, symbol)
    }

    const sampled = [...symbols.values()]
    for (let index = sampled.length - 1; index > 0; index -= 1) {
      const target = Math.floor(Math.min(Math.max(this.random(), 0), 0.999999999) * (index + 1))
      ;[sampled[index], sampled[target]] = [sampled[target]!, sampled[index]!]
    }
    return sampled.slice(0, 9).map((symbol) => publicSymbol(symbol, 'en'))
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
      limit: REPOSITORY_PAGE_SIZE + 1,
      offset: options.page * REPOSITORY_PAGE_SIZE,
      sort: ['symbolId:asc'],
      filter,
    })
    const hits = result.hits ?? []
    const symbols = hits.slice(0, REPOSITORY_PAGE_SIZE)
      .map((symbol) => publicSymbol(symbol, 'en'))
    let nextUrl: string | undefined
    if (hits.length > REPOSITORY_PAGE_SIZE) {
      const params = new URLSearchParams({ page: String(options.page + 1) })
      if (options.unsafe) params.set('unsafe', '1')
      else if (options.hasSkin) params.set('has_skin', '1')
      nextUrl = `/api/v1/repositories/${encodeURIComponent(repoKey)}/symbols?${params}`
    }
    return { kind: 'found', symbols, nextUrl }
  }

  async searchSymbols(options: DiscoverySearchOptions): Promise<PublicSearchSymbol[]> {
    if (options.page > MAX_SEARCH_PAGE) return []
    const repoFilter = extractFilter(options.query, 'repo')
    const favorFilter = extractFilter(repoFilter.query, 'favor')
    const query = normalize(favorFilter.query)
    const locale = normalizedLocale(options.locale)
    const filter = ['visible = true']
    if (options.safe) filter.push('safe = true')
    if (repoFilter.value) filter.push(`repoKey = ${quotedFilter(repoFilter.value)}`)
    filter.push(locale === 'en' ? 'locale = "en"' : `(locale = ${quotedFilter(locale)} OR locale = "en")`)

    const desired = (options.page + 1) * SEARCH_PAGE_SIZE
    const symbolOrder: number[] = []
    const symbolById = new Map<number, MeilisearchSymbol>()
    let offset = 0
    while (symbolOrder.length < desired) {
      const result = await this.search<MeilisearchSymbol>(this.symbolIndex, {
        q: query,
        limit: PROVIDER_BATCH_SIZE,
        offset,
        filter,
        showRankingScore: true,
      })
      const hits = result.hits ?? []
      for (const symbol of hits) {
        if (!symbolById.has(symbol.symbolId)) {
          symbolOrder.push(symbol.symbolId)
          symbolById.set(symbol.symbolId, symbol)
        }
      }
      offset += hits.length
      if (hits.length < PROVIDER_BATCH_SIZE) break
    }

    const pageIds = symbolOrder.slice(options.page * SEARCH_PAGE_SIZE, desired)
    if (locale !== 'en' && pageIds.length) {
      const localized = await this.search<MeilisearchSymbol>(this.symbolIndex, {
        q: '',
        limit: pageIds.length,
        filter: [
          `symbolId IN [${pageIds.join(', ')}]`,
          `locale = ${quotedFilter(locale)}`,
          'visible = true',
        ],
      })
      for (const symbol of localized.hits ?? []) {
        const rankedSymbol = symbolById.get(symbol.symbolId)
        symbolById.set(symbol.symbolId, {
          ...symbol,
          _rankingScore: rankedSymbol?._rankingScore,
        })
      }
    }

    let ranked = pageIds.map((symbolId) => symbolById.get(symbolId)!)

    if (favorFilter.value && options.page === 0) {
      const favored = ranked.slice(0, 10)
        .filter((symbol) => symbol.repoKey.toLowerCase() === favorFilter.value)
      const favoredIds = new Set(favored.map((symbol) => symbol.symbolId))
      ranked = [...favored, ...ranked.filter((symbol) => !favoredIds.has(symbol.symbolId))]
    }

    return ranked
      .map((symbol) => ({
        ...publicSymbol(symbol, locale),
        use_score: 0,
        relevance: symbol._rankingScore ?? 0,
        repo_index: 0,
      }))
  }

  async close() {}
}
