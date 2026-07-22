export interface Attribution {
  license: string | null
  license_url: string | null
  author_name: string | null
  author_url: string | null
}

export interface Repository {
  repo_key: string
  name: string
  description: string | null
  url: string | null
  symbol_count: number
  logo_url: string
  attribution: Attribution
}

export interface SymbolResult {
  id: number
  symbol_key: string
  name: string
  description?: string | null
  locale: string
  license: string | null
  license_url: string | null
  enabled: boolean
  author: string | null
  author_url: string | null
  source_url: string | null
  repo_key: string
  protected_symbol: boolean
  extension: string | null
  image_url: string
  unsafe_result: boolean
  skins: boolean
  details_url: string
}

export interface PaginatedSymbols {
  symbols: SymbolResult[]
  meta?: { next_url?: string }
}
