import { publicSymbolJson, type PublicReadImageOptions } from './public-read-api.js'
import type { PublicDiscoveryStore } from './public-read-store.js'
import type { PublicSymbol, RepositoryRecord, SymbolRecord } from './public-read-types.js'

const SEARCH_PAGE_SIZE = 50
const REPOSITORY_PAGE_SIZE = 60

export interface PublicSearchSymbol extends PublicSymbol {
  use_score: number
  relevance: number
  repo_index: number
}

function enabled(symbol: SymbolRecord) {
  return symbol.enabled !== false && symbol.settings.enabled !== false
}

function unsafe(symbol: SymbolRecord) {
  return symbol.unsafeResult === true || symbol.settings.unsafe_result === true
}

function hasSkin(symbol: SymbolRecord) {
  return symbol.hasSkin === true || symbol.settings.has_skin === true
}

function publicRepository(repository: RepositoryRecord | undefined) {
  return Boolean(repository && repository.settings.active !== false && !repository.settings.protected)
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[.()/]/g, ' ').replace(/\s+/g, ' ').trim()
}

function normalizedLocale(value: string | undefined) {
  return normalize(value || 'en').split(/[-_]/)[0] || 'en'
}

function extractFilter(query: string, name: 'repo' | 'favor') {
  const match = query.match(new RegExp(`(?:^|\\s)${name}:([\\w-]+)`, 'i'))
  return {
    value: match?.[1]?.toLowerCase(),
    query: match ? `${query.slice(0, match.index)} ${query.slice((match.index ?? 0) + match[0].length)}` : query,
  }
}

function relevance(symbol: SymbolRecord, query: string, locale: string) {
  if (!query) return 0
  const localized = symbol.settings.locales?.[locale] ?? symbol.settings.locales?.en
  const english = symbol.settings.locales?.en
  const name = normalize(String(localized?.name ?? symbol.settings.name ?? ''))
  const searchable = normalize([
    name,
    localized?.description,
    localized?.search_string,
    english?.name,
    english?.description,
    english?.search_string,
    symbol.settings.name,
    symbol.settings.description,
    symbol.repoKey,
    symbol.settings.image_url,
  ].filter((value) => typeof value === 'string').join(' '))
  const terms = query.split(' ').filter(Boolean)
  if (!terms.every((term) => searchable.includes(term))) return null

  let score = 10
  if (name === query) score += 100
  if (name.startsWith(query)) score += 60
  if (new RegExp(`(?:^|\\s)${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|\\s)`).test(name)) score += 30
  if (searchable.includes(query)) score += 20
  return score
}

export async function randomPublicSymbols(
  store: PublicDiscoveryStore,
  imageOptions: PublicReadImageOptions,
  random: () => number = Math.random,
) {
  const [repositories, symbols] = await Promise.all([store.listRepositories(), store.listSymbols()])
  const repositoryByKey = new Map(repositories.map((repository) => [repository.repoKey, repository]))
  const candidates = symbols.filter((symbol) =>
    enabled(symbol) && !unsafe(symbol) && !symbol.settings.protected_symbol &&
    publicRepository(repositoryByKey.get(symbol.repoKey)))
  for (let index = candidates.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    const current = candidates[index]!
    candidates[index] = candidates[swapIndex]!
    candidates[swapIndex] = current
  }
  return candidates.slice(0, 9).map((symbol) => publicSymbolJson(symbol, imageOptions))
}

export type RepositorySymbolsResult =
  | { kind: 'not_found' }
  | { kind: 'found'; symbols: PublicSymbol[]; nextUrl?: string }

export async function listPublicRepositorySymbols(
  store: PublicDiscoveryStore,
  repoKey: string,
  options: { page: number; unsafe: boolean; hasSkin: boolean; image: PublicReadImageOptions },
): Promise<RepositorySymbolsResult> {
  const repository = await store.findRepository(repoKey)
  if (!repository || !publicRepository(repository)) return { kind: 'not_found' }
  let symbols = (await store.listRepositorySymbols(repoKey)).filter((symbol) =>
    enabled(symbol) && !symbol.settings.protected_symbol)
  if (options.unsafe) symbols = symbols.filter(unsafe)
  else if (options.hasSkin) symbols = symbols.filter(hasSkin)
  const start = options.page * REPOSITORY_PAGE_SIZE
  const pageSymbols = symbols.slice(start, start + REPOSITORY_PAGE_SIZE)
  let nextUrl: string | undefined
  if (symbols.length > start + REPOSITORY_PAGE_SIZE) {
    const params = new URLSearchParams({ page: String(options.page + 1) })
    if (options.unsafe) params.set('unsafe', '1')
    else if (options.hasSkin) params.set('has_skin', '1')
    nextUrl = `/api/v1/repositories/${encodeURIComponent(repoKey)}/symbols?${params}`
  }
  return {
    kind: 'found',
    symbols: pageSymbols.map((symbol) => publicSymbolJson(symbol, options.image)),
    nextUrl,
  }
}

export async function searchPublicSymbols(
  store: PublicDiscoveryStore,
  options: {
    query: string
    locale?: string
    safe: boolean
    page: number
    image: PublicReadImageOptions
  },
) {
  const repoFilter = extractFilter(options.query, 'repo')
  const favorFilter = extractFilter(repoFilter.query, 'favor')
  const query = normalize(favorFilter.query)
  const locale = normalizedLocale(options.locale)
  const [repositories, symbols] = await Promise.all([store.listRepositories(), store.listSymbols()])
  const repositoryByKey = new Map(repositories.map((repository) => [repository.repoKey, repository]))

  const ranked = symbols.flatMap((symbol) => {
    if (!enabled(symbol) || symbol.settings.protected_symbol ||
        !publicRepository(repositoryByKey.get(symbol.repoKey)) ||
        (options.safe && unsafe(symbol)) ||
        (repoFilter.value && symbol.repoKey.toLowerCase() !== repoFilter.value)) return []
    const score = relevance(symbol, query, locale)
    if (score === null) return []
    const localized = symbol.settings.locales?.[locale] ?? symbol.settings.locales?.en
    const useScore = typeof localized?.use_scores?.[query] === 'number' ? localized.use_scores[query] : 0
    return [{
      symbol,
      relevance: score + useScore,
      useScore,
    }]
  }).sort((left, right) => right.relevance - left.relevance || left.symbol.id - right.symbol.id)

  const repositoryCounts = new Map<string, number>()
  let balanced = ranked.map((entry) => {
    const count = (repositoryCounts.get(entry.symbol.repoKey) ?? 0) + 1
    repositoryCounts.set(entry.symbol.repoKey, count)
    return { ...entry, repositoryIndex: count <= 5 ? 2 : count <= 10 ? 1 : 0 }
  }).sort((left, right) => right.repositoryIndex - left.repositoryIndex || right.relevance - left.relevance)

  if (favorFilter.value) {
    const favored = balanced.slice(0, 10)
      .filter((entry) => entry.symbol.repoKey.toLowerCase() === favorFilter.value)
    const favoredIds = new Set(favored.map((entry) => entry.symbol.id))
    balanced = [...favored, ...balanced.filter((entry) => !favoredIds.has(entry.symbol.id))]
  }

  return balanced
    .slice(options.page * SEARCH_PAGE_SIZE, (options.page + 1) * SEARCH_PAGE_SIZE)
    .map((entry): PublicSearchSymbol => ({
      ...publicSymbolJson(entry.symbol, options.image, locale),
      use_score: entry.useScore,
      relevance: entry.relevance,
      repo_index: entry.repositoryIndex,
    }))
}

export async function submitPublicSymbolRequest(
  store: PublicDiscoveryStore,
  input: { name?: unknown; first_letter?: unknown; comments?: unknown },
  createdAt: string,
) {
  const name = typeof input.name === 'string' ? input.name.trim() : ''
  const firstLetter = typeof input.first_letter === 'string' ? input.first_letter.trim().toLowerCase() : ''
  const comments = typeof input.comments === 'string' ? input.comments.trim() : ''
  if (!name || !comments || firstLetter !== name[0]?.toLowerCase()) return false
  await store.addSymbolRequest(name, comments, createdAt)
  return true
}
