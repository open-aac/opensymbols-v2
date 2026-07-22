import type { PublicReadStore } from './public-read-store.js'
import type {
  PublicRepository,
  PublicSymbol,
  RepositoryAttributionSettings,
  RepositoryRecord,
  SymbolRecord,
} from './public-read-types.js'

export interface PublicReadImageOptions {
  s3Bucket?: string
  s3Cdn?: string
}

export type PublicSymbolResult =
  | { kind: 'found'; symbol: PublicSymbol }
  | { kind: 'not_found'; id: string }

function nullableString(value: unknown) {
  return typeof value === 'string' ? value : null
}

function repositoryJson(repository: RepositoryRecord): PublicRepository {
  const attribution = repository.settings.default_attribution as RepositoryAttributionSettings | undefined
  return {
    repo_key: repository.repoKey,
    name: nullableString(repository.settings.name),
    description: nullableString(repository.settings.description),
    url: nullableString(repository.settings.url),
    symbol_count:
      repository.settings.n_protected_symbols ?? repository.settings.n_symbols ?? 0,
    logo_url: `/repositories/${repository.repoKey}.png`,
    attribution: {
      license: nullableString(attribution?.license),
      license_url: nullableString(attribution?.license_url),
      author_name: nullableString(attribution?.author_name),
      author_url: nullableString(attribution?.author_url),
    },
  }
}

function fullImageUrl(symbol: SymbolRecord, options: PublicReadImageOptions) {
  let url = nullableString(symbol.settings.image_url)
  if (!url) return null

  if (url.startsWith('/')) {
    url = `https://s3.amazonaws.com/${options.s3Bucket ?? ''}${url}`
  }

  if (options.s3Bucket && options.s3Cdn) {
    const virtualHostedPrefix = `https://${options.s3Bucket}.s3.amazonaws.com/`
    const pathPrefix = `https://s3.amazonaws.com/${options.s3Bucket}/`
    if (url.startsWith(virtualHostedPrefix)) {
      url = `${options.s3Cdn}/${url.slice(virtualHostedPrefix.length)}`
    } else if (url.startsWith(pathPrefix)) {
      url = `${options.s3Cdn}/${url.slice(pathPrefix.length)}`
    }
  }

  return url
}

export function publicSymbolJson(
  symbol: SymbolRecord,
  options: PublicReadImageOptions,
  locale = 'en',
): PublicSymbol {
  const localized = symbol.settings.locales?.[locale] ?? symbol.settings.locales?.en
  const baseDescription = nullableString(symbol.settings.description)
  return {
    id: symbol.id,
    symbol_key: symbol.symbolKey,
    name: nullableString(localized?.name) ?? nullableString(symbol.settings.name),
    description: nullableString(localized?.description) ?? baseDescription,
    locale,
    license: nullableString(symbol.settings.license),
    license_url: nullableString(symbol.settings.license_url),
    enabled: typeof symbol.settings.enabled === 'boolean' ? symbol.settings.enabled : null,
    author: nullableString(symbol.settings.author),
    author_url: nullableString(symbol.settings.author_url),
    source_url: nullableString(symbol.settings.source_url),
    repo_key: symbol.repoKey,
    hc: /\bhc\b/.test(baseDescription ?? ''),
    protected_symbol: Boolean(symbol.settings.protected_symbol),
    extension: nullableString(symbol.settings.file_extension),
    image_url: fullImageUrl(symbol, options),
    search_string:
      nullableString(localized?.search_string) ?? nullableString(symbol.settings.search_string),
    unsafe_result: Boolean(symbol.settings.unsafe_result),
    skins: Boolean(symbol.settings.has_skin && symbol.settings.has_variants),
    _href: `/api/v1/symbols/${symbol.repoKey}/${symbol.symbolKey}?id=${symbol.id}`,
    details_url: `/symbols/${symbol.repoKey}/${symbol.symbolKey}?id=${symbol.id}`,
  }
}

export async function listPublicRepositories(store: PublicReadStore) {
  const repositories = await store.listRepositories()
  return repositories
    .filter((repository) =>
      repository.settings.active !== false && !repository.settings.protected)
    .sort((left, right) => {
      const leftName = nullableString(left.settings.name)?.toLowerCase() ?? ''
      const rightName = nullableString(right.settings.name)?.toLowerCase() ?? ''
      return leftName < rightName ? -1 : leftName > rightName ? 1 : 0
    })
    .map(repositoryJson)
}

export async function findPublicRepository(store: PublicReadStore, repoKey: string) {
  const repository = await store.findRepository(repoKey)
  if (
    !repository ||
    repository.settings.active === false ||
    repository.settings.protected
  ) return null
  return repositoryJson(repository)
}

export async function findPublicSymbol(
  store: PublicReadStore,
  repoKey: string,
  symbolKey: string,
  imageOptions: PublicReadImageOptions,
): Promise<PublicSymbolResult> {
  const repository = await store.findRepository(repoKey)
  if (!repository || repository.settings.active === false || repository.settings.protected) {
    return { kind: 'not_found', id: repoKey }
  }

  const symbol = await store.findSymbol(repoKey, symbolKey)
  if (!symbol || symbol.settings.enabled === false || symbol.settings.protected_symbol) {
    return { kind: 'not_found', id: `${repoKey}/${symbolKey}` }
  }

  return { kind: 'found', symbol: publicSymbolJson(symbol, imageOptions) }
}
