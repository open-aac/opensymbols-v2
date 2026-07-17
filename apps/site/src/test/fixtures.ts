import type { Repository, SymbolResult } from '../types'

export const repository: Repository = {
  repo_key: 'demo',
  name: 'Demo Symbols',
  description: 'Friendly symbols for everyday communication.',
  url: 'https://example.com/demo',
  symbol_count: 60,
  logo_url: '/open-symbols-mark.svg',
  attribution: {
    license: 'CC BY 4.0',
    license_url: 'https://creativecommons.org/licenses/by/4.0/',
    author_name: 'Example Designer',
    author_url: 'https://example.com/designer',
  },
}

export const smallerRepository: Repository = {
  ...repository,
  repo_key: 'small',
  name: 'Small Symbols',
  symbol_count: 2,
  attribution: { ...repository.attribution, license: 'CC BY-SA' },
}

export const symbol: SymbolResult = {
  id: 1,
  symbol_key: 'hello-a1',
  name: 'Hello',
  description: 'A person waving hello.',
  locale: 'en',
  license: 'CC BY 4.0',
  license_url: 'https://creativecommons.org/licenses/by/4.0/',
  enabled: true,
  author: 'Example Designer',
  author_url: 'https://example.com/designer',
  source_url: 'https://example.com/hello',
  repo_key: 'demo',
  protected_symbol: false,
  extension: 'svg',
  image_url: '/demo-symbols/hello.svg',
  unsafe_result: false,
  skins: true,
  details_url: '/symbols/demo/hello-a1',
}
