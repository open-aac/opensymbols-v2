export type JsonPrimitive = boolean | number | string | null
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }

export interface RepositoryAttributionSettings {
  license?: string | null
  license_url?: string | null
  author_name?: string | null
  author_url?: string | null
  [key: string]: JsonValue | undefined
}

export interface RepositorySettings {
  active?: boolean
  protected?: boolean
  name?: string | null
  description?: string | null
  url?: string | null
  n_symbols?: number
  n_protected_symbols?: number
  default_attribution?: RepositoryAttributionSettings
  [key: string]: JsonValue | RepositoryAttributionSettings | undefined
}

export interface SymbolLocaleSettings {
  name?: string | null
  description?: string | null
  search_string?: string | null
  use_scores?: Record<string, number>
  [key: string]: JsonValue | Record<string, number> | undefined
}

export interface SymbolSettings {
  name?: string | null
  description?: string | null
  enabled?: boolean
  image_url?: string | null
  file_extension?: string | null
  license?: string | null
  license_url?: string | null
  author?: string | null
  author_url?: string | null
  source_url?: string | null
  protected_symbol?: boolean
  unsafe_result?: boolean
  has_skin?: boolean
  has_variants?: boolean
  search_string?: string | null
  locales?: Record<string, SymbolLocaleSettings>
  [key: string]: JsonValue | Record<string, SymbolLocaleSettings> | undefined
}

export interface RepositoryRecord {
  repoKey: string
  settings: RepositorySettings
}

export interface SymbolRecord {
  id: number
  repoKey: string
  symbolKey: string
  enabled: boolean | null
  hasSkin: boolean | null
  unsafeResult: boolean | null
  settings: SymbolSettings
}

export interface PublicRepository {
  repo_key: string
  name: string | null
  description: string | null
  url: string | null
  symbol_count: number
  logo_url: string
  attribution: {
    license: string | null
    license_url: string | null
    author_name: string | null
    author_url: string | null
  }
}

export interface PublicSymbol {
  id: number
  symbol_key: string
  name: string | null
  description: string | null
  locale: string
  license: string | null
  license_url: string | null
  enabled: boolean | null
  author: string | null
  author_url: string | null
  source_url: string | null
  repo_key: string
  hc: boolean
  protected_symbol: boolean
  extension: string | null
  image_url: string | null
  search_string: string | null
  unsafe_result: boolean
  skins: boolean
  _href: string
  details_url: string
}
