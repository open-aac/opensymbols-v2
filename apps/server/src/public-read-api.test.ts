import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from './app.js'
import type { PublicReadStore } from './public-read-store.js'
import type { RepositoryRecord, SymbolRecord } from './public-read-types.js'

interface Contract {
  name: string
  request: {
    method: string
    path: string
    credentials?: string
  }
  response: {
    status: number
    body: unknown
  }
}

const contractDirectory = fileURLToPath(
  new URL('../../legacy-server/test/contracts/public-read/', import.meta.url),
)

function contracts(filename: string): Contract[] {
  return JSON.parse(readFileSync(`${contractDirectory}${filename}`, 'utf8')) as Contract[]
}

const repositories: RepositoryRecord[] = [
  {
    repoKey: 'demo',
    settings: {
      name: 'Demo Symbols',
      description: 'Friendly symbols for contract testing.',
      url: 'https://example.test/demo',
      active: true,
      protected: false,
      n_symbols: 4,
      default_attribution: {
        license: 'CC BY 4.0',
        license_url: 'https://creativecommons.org/licenses/by/4.0/',
        author_name: 'Contract Artist',
        author_url: 'https://example.test/artist',
      },
    },
  },
  { repoKey: 'alpha', settings: { name: 'alpha symbols', active: true, protected: false, n_symbols: 0 } },
  { repoKey: 'inactive', settings: { name: 'Inactive Symbols', active: false, protected: false, n_symbols: 1 } },
  {
    repoKey: 'protected',
    settings: {
      name: 'Protected Symbols',
      description: 'Only visible to administrators.',
      active: true,
      protected: true,
      n_symbols: 0,
      n_protected_symbols: 1,
    },
  },
]

const symbols: SymbolRecord[] = [
  {
    id: 2101,
    repoKey: 'demo',
    symbolKey: 'hello',
    enabled: true,
    hasSkin: true,
    unsafeResult: true,
    settings: {
      name: 'Base hello',
      description: 'A friendly hc greeting.',
      enabled: true,
      image_url: 'https://assets.example.test/hello.svg',
      file_extension: 'svg',
      license: 'CC BY 4.0',
      license_url: 'https://creativecommons.org/licenses/by/4.0/',
      author: 'Contract Artist',
      author_url: 'https://example.test/artist',
      source_url: 'https://example.test/source/hello',
      unsafe_result: true,
      has_skin: true,
      has_variants: true,
      locales: { en: { name: 'Base hello', search_string: 'base hello - a friendly hc greeting, ,' } },
    },
  },
  {
    id: 2102,
    repoKey: 'demo',
    symbolKey: 'cdn-image',
    enabled: true,
    hasSkin: false,
    unsafeResult: false,
    settings: {
      name: 'CDN image',
      enabled: true,
      image_url: '/libraries/demo/cdn-image.png',
      file_extension: 'png',
      locales: { en: { search_string: 'cdn image - , ,' } },
    },
  },
  {
    id: 2103,
    repoKey: 'demo',
    symbolKey: 'disabled',
    enabled: false,
    hasSkin: false,
    unsafeResult: false,
    settings: { name: 'Disabled', enabled: false },
  },
  {
    id: 2104,
    repoKey: 'demo',
    symbolKey: 'private-symbol',
    enabled: true,
    hasSkin: false,
    unsafeResult: false,
    settings: { name: 'Private symbol', enabled: true, protected_symbol: true },
  },
  {
    id: 2105,
    repoKey: 'inactive',
    symbolKey: 'still-visible',
    enabled: true,
    hasSkin: false,
    unsafeResult: false,
    settings: {
      name: 'Still visible',
      enabled: true,
      image_url: 'https://assets.example.test/still-visible.svg',
      file_extension: 'svg',
      locales: { en: { search_string: 'still visible - , ,' } },
    },
  },
  {
    id: 2106,
    repoKey: 'protected',
    symbolKey: 'secret',
    enabled: true,
    hasSkin: false,
    unsafeResult: false,
    settings: { name: 'Secret', enabled: true },
  },
]

function contractStore(): PublicReadStore {
  return {
    async listRepositories() {
      return repositories
    },
    async findRepository(repoKey) {
      return repositories.find((repository) => repository.repoKey === repoKey) ?? null
    },
    async findSymbol(repoKey, symbolKey) {
      return symbols.find((symbol) =>
        symbol.repoKey === repoKey && symbol.symbolKey === symbolKey) ?? null
    },
    async close() {},
  }
}

describe('Hono public-read Rails contracts', () => {
  const app = createApp({
    publicReadStore: contractStore(),
    legacyServerUrl: 'http://127.0.0.1:1',
    s3Bucket: 'contract-bucket',
    s3Cdn: 'https://cdn.example.test',
  })

  const anonymousContracts = [
    ...contracts('repositories-index.json'),
    ...contracts('repository-show.json'),
    ...contracts('symbol-show.json'),
  ].filter((contract) => !contract.request.credentials)

  for (const contract of anonymousContracts) {
    it(contract.name, async () => {
      const response = await app.request(contract.request.path, { method: contract.request.method })
      expect(response.status).toBe(contract.response.status)
      await expect(response.json()).resolves.toEqual(contract.response.body)
    })
  }
})

describe('public-read ownership boundaries', () => {
  let upstream: Server
  let upstreamUrl: string

  beforeAll(async () => {
    upstream = createServer((request, response) => {
      response.setHeader('content-type', 'application/json')
      response.setHeader('x-owner', 'rails')
      response.end(JSON.stringify({
        owner: 'rails',
        method: request.method,
        url: request.url,
        authorization: request.headers.authorization ?? null,
      }))
    })
    await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve))
    const address = upstream.address() as AddressInfo
    upstreamUrl = `http://127.0.0.1:${address.port}`
  })

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      upstream.close((error) => error ? reject(error) : resolve()))
  })

  it.each([
    ['/api/v2/repositories', { headers: { Authorization: 'invalid-token' } }],
    ['/api/v2/repositories/demo?access_token=invalid-token', {}],
    ['/api/v2/symbols/demo/hello?search_token=invalid-token', {}],
  ] as const)('proxies credential-bearing read %s to Rails', async (path, init) => {
    const app = createApp({ publicReadStore: contractStore(), legacyServerUrl: upstreamUrl })
    const response = await app.request(path, init)
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ owner: 'rails' })
  })

  it('leaves other methods and API routes with Rails', async () => {
    const app = createApp({ publicReadStore: contractStore(), legacyServerUrl: upstreamUrl })
    const post = await app.request('/api/v2/repositories', { method: 'POST' })
    const head = await app.request('/api/v2/repositories', { method: 'HEAD' })
    const other = await app.request('/api/v2/token', { method: 'POST' })
    await expect(post.json()).resolves.toMatchObject({ owner: 'rails', method: 'POST' })
    expect(head.headers.get('x-owner')).toBe('rails')
    await expect(other.json()).resolves.toMatchObject({ owner: 'rails', url: '/api/v2/token' })
  })

  it('keeps exact reads with Rails when no store is injected', async () => {
    const app = createApp({ legacyServerUrl: upstreamUrl })
    const response = await app.request('/api/v2/repositories')
    await expect(response.json()).resolves.toMatchObject({ owner: 'rails' })
  })

  it.each([
    '/api/v2/repositories',
    '/api/v2/repositories/demo',
    '/api/v2/symbols/demo/hello',
  ])('returns a stable database error for %s while health remains independent', async (path) => {
    const unavailableStore: PublicReadStore = {
      async listRepositories() { throw new Error('private database details') },
      async findRepository() { throw new Error('private database details') },
      async findSymbol() { throw new Error('private database details') },
      async close() {},
    }
    const app = createApp({ publicReadStore: unavailableStore, legacyServerUrl: upstreamUrl })

    const response = await app.request(path)
    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({ error: 'database_unavailable' })
    const health = await app.request('/api/health')
    expect(health.status).toBe(200)
    await expect(health.json()).resolves.toEqual({ status: 'ok' })
  })
})
