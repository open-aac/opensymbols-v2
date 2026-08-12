export type Locale = string
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }
export interface RepositoryRecord {
  repoKey: string
  name: string
  description: string
  active: boolean
  protected: boolean
  attribution: { license: string; author: string }
}

export interface SymbolRecord {
  id: number
  repoKey: string
  symbolKey: string
  imageUrl: string
  enabled: boolean
  protected: boolean
  unsafe: boolean
  hasSkin: boolean
  hasVariants: boolean
  attribution: { license: string; author: string }
}

export interface LocalizationRecord {
  symbolId: number
  locale: Locale
  name: string
  description: string
  searchTerms: string[]
  synonyms: string[]
  keywordBoosts: Record<string, number>
}

export interface SearchDocument {
  id: string
  symbolId: number
  symbolKey: string
  repoKey: string
  locale: Locale
  safe: boolean
  visible: boolean
  name: string
  description: string
  englishName: string
  englishDescription: string
  searchTerms: string[]
  synonyms: string[]
  keywordBoosts: Array<{ term: string; weight: number }>
  text: string
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
}

export interface RepositoryDocument {
  id: string
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
