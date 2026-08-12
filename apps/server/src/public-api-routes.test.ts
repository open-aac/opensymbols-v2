import { describe, expect, it, vi } from 'vitest'
import { createApp } from './app.js'
import type { ExternalSourceRecord, PublicApiStore } from './public-read-store.js'
import type { RepositoryRecord, SymbolRecord } from './public-read-types.js'

const fixedNow = new Date('2026-07-22T10:00:00.000Z')
const signingKey = 'dedicated-public-api-signing-key'
const repositories: RepositoryRecord[] = [
  { repoKey: 'demo', settings: { name: 'Demo', active: true } },
  { repoKey: 'private', settings: { name: 'Private', active: true, protected: true } },
]
const symbols: SymbolRecord[] = [
  {
    id: 1, repoKey: 'demo', symbolKey: 'hello', enabled: true, hasSkin: false,
    unsafeResult: false, settings: { name: 'Hello', enabled: true },
  },
  {
    id: 2, repoKey: 'demo', symbolKey: 'unsafe', enabled: true, hasSkin: false,
    unsafeResult: true, settings: { name: 'Unsafe hello', enabled: true, unsafe_result: true },
  },
  {
    id: 3, repoKey: 'private', symbolKey: 'secret', enabled: true, hasSkin: false,
    unsafeResult: false, settings: { name: 'Secret hello', enabled: true },
  },
]

function routeStore(): PublicApiStore {
  const sources: ExternalSourceRecord[] = []
  return {
    async listRepositories() { return repositories },
    async findRepository(repoKey) {
      return repositories.find((repository) => repository.repoKey === repoKey) ?? null
    },
    async findSymbol(repoKey, symbolKey) {
      return symbols.find((symbol) => symbol.repoKey === repoKey && symbol.symbolKey === symbolKey) ?? null
    },
    async listSymbols() { return symbols },
    async listRepositorySymbols(repoKey) { return symbols.filter((symbol) => symbol.repoKey === repoKey) },
    async addSymbolRequest() {},
    async createExternalSource(token, settings) {
      const source = { id: sources.length + 7, token, settings }
      sources.push(source)
      return source
    },
    async findExternalSourceByToken(token) {
      return sources.find((source) => source.token === token) ?? null
    },
    async findExternalSourceById(id) {
      return sources.find((source) => source.id === id) ?? null
    },
    async close() {},
  }
}

function apiApp(store = routeStore(), now = fixedNow, options: {
  signingKey?: string
  legacyVerificationKey?: string
} = {}) {
  return createApp({
    publicApiStore: store,
    publicApiTokenSigningKey: options.signingKey ?? signingKey,
    publicApiLegacyTokenVerificationKey: options.legacyVerificationKey,
    publicApiNow: () => now,
    publicApiNonce: (label) => label === 'external_source_token'
      ? 'generated-shared-secret'
      : '0123456789abcdef01234567',
  })
}

async function createAccessToken(store: PublicApiStore) {
  return createAccessTokenWithApp(apiApp(store))
}

async function createAccessTokenWithApp(app: ReturnType<typeof createApp>) {
  const application = await app.request('/api/v2/generate_secret', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      org_name: ' AAC Example ',
      org_email: ' api@example.com ',
      org_purpose: ' Search testing ',
    }),
  })
  expect(application.status).toBe(200)
  await expect(application.json()).resolves.toEqual({ shared_secret: 'generated-shared-secret' })
  const token = await app.request('/api/v2/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ secret: 'generated-shared-secret' }),
  })
  expect(token.status).toBe(200)
  return (await token.json() as { access_token: string }).access_token
}

describe('documented v2 public API routes', () => {
  it('creates an application, exchanges its secret, and searches with either token location', async () => {
    const store = routeStore()
    const token = await createAccessToken(store)
    const app = apiApp(store)

    const headerSearch = await app.request('/api/v2/symbols?q=hello&safe=1', {
      headers: { Authorization: token },
    })
    const querySearch = await app.request(`/api/v2/symbols?q=hello&safe=0&access_token=${encodeURIComponent(token)}`)
    expect(headerSearch.status).toBe(200)
    expect(headerSearch.headers.get('Authorized')).toBe('true')
    expect((await headerSearch.json() as Array<{ id: number }>).map((symbol) => symbol.id)).toEqual([1])
    expect((await querySearch.json() as Array<{ id: number }>).map((symbol) => symbol.id)).toEqual([1, 2])
  })

  it.each([
    [{ org_name: '', org_email: 'api@example.com', org_purpose: 'Testing' }, 422],
    [{ org_name: 'AAC', org_email: 'invalid', org_purpose: 'Testing' }, 422],
    [{ org_name: 'AAC', org_email: 'api@example.com', org_purpose: '' }, 422],
  ])('rejects invalid application fields', async (fields, status) => {
    const response = await apiApp().request('/api/v2/generate_secret', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(fields),
    })
    expect(response.status).toBe(status)
  })

  it('rejects missing, invalid, temporary, and tampered credentials', async () => {
    const store = routeStore()
    const token = await createAccessToken(store)
    const app = apiApp(store)
    const missingSecret = await app.request('/api/v2/token', { method: 'POST' })
    const invalidSecret = await app.request('/api/v2/token', {
      method: 'POST', body: new URLSearchParams({ secret: 'missing' }),
    })
    const temporarySecret = await app.request('/api/v2/token', {
      method: 'POST', body: new URLSearchParams({ secret: 'temp:legacy' }),
    })
    const missingToken = await app.request('/api/v2/symbols?q=hello')
    const tampered = await app.request('/api/v2/symbols?q=hello', {
      headers: { Authorization: `${token.slice(0, -1)}0` },
    })

    expect(missingSecret.status).toBe(400)
    expect(invalidSecret.status).toBe(400)
    expect(temporarySecret.status).toBe(400)
    expect(missingToken.status).toBe(400)
    expect(tampered.status).toBe(400)
  })

  it('returns the token-expired boundary after 36 hours', async () => {
    const store = routeStore()
    const token = await createAccessToken(store)
    const expired = await apiApp(
      store,
      new Date(fixedNow.getTime() + 36 * 60 * 60 * 1000),
    ).request('/api/v2/symbols?q=hello', { headers: { Authorization: token } })

    expect(expired.status).toBe(401)
    await expect(expired.json()).resolves.toEqual({ error: 'token expired', token_expired: true })
  })

  it('supports a verification-only legacy overlap without issuing legacy signatures', async () => {
    const store = routeStore()
    const legacySigningKey = 'former-public-api-signing-key'
    const legacyToken = await createAccessTokenWithApp(apiApp(store, fixedNow, {
      signingKey: legacySigningKey,
    }))
    const overlapApp = apiApp(store, fixedNow, { legacyVerificationKey: legacySigningKey })
    const accepted = await overlapApp.request('/api/v2/symbols?q=hello', {
      headers: { Authorization: legacyToken },
    })
    expect(accepted.status).toBe(200)

    const newTokenResponse = await overlapApp.request('/api/v2/token', {
      method: 'POST', body: new URLSearchParams({ secret: 'generated-shared-secret' }),
    })
    const newToken = (await newTokenResponse.json() as { access_token: string }).access_token
    const legacyOnlyApp = apiApp(store, fixedNow, { signingKey: legacySigningKey })
    expect((await legacyOnlyApp.request('/api/v2/symbols?q=hello', {
      headers: { Authorization: newToken },
    })).status).toBe(400)
    expect((await apiApp(store).request('/api/v2/symbols?q=hello', {
      headers: { Authorization: legacyToken },
    })).status).toBe(400)
  })

  it('returns stable database errors without exposing failures', async () => {
    const store = routeStore()
    store.createExternalSource = vi.fn().mockRejectedValue(new Error('private database detail'))
    const response = await apiApp(store).request('/api/v2/generate_secret', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        org_name: 'AAC', org_email: 'api@example.com', org_purpose: 'Testing',
      }),
    })
    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({ error: 'database_unavailable' })
  })

  it('reports missing token-signing configuration without falling back to Rails', async () => {
    const app = createApp({ publicApiStore: routeStore(), publicApiTokenSigningKey: '' })
    const token = await app.request('/api/v2/token', {
      method: 'POST', body: new URLSearchParams({ secret: 'shared-secret' }),
    })
    const search = await app.request('/api/v2/symbols?q=hello', {
      headers: { Authorization: 'token::invalid' },
    })
    expect(token.status).toBe(503)
    expect(search.status).toBe(503)
    await expect(token.json()).resolves.toEqual({ error: 'authentication_unconfigured' })
    await expect(search.json()).resolves.toEqual({ error: 'authentication_unconfigured' })
  })
})
