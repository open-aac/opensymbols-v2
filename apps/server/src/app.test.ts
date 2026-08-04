import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { app, createApp } from './app.js'
import type { DiscoveryCatalog } from './discovery-catalog.js'
import type { CharacterRecord, CharacterStore } from './character-store.js'

describe('GET /api/health', () => {
  it('reports that the server is healthy', async () => {
    const response = await app.request('/api/health')

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/json')
    await expect(response.json()).resolves.toEqual({ status: 'ok' })
  })
})

describe('synthetic symbol images', () => {
  it('serves deterministic immutable SVGs and supported skin tones', async () => {
    const first = await app.request('/api/synthetic-images/0000001.svg')
    const repeated = await app.request('/api/synthetic-images/0000001.svg')
    const tone = await app.request('/api/synthetic-images/0000001-variant-medium-dark.svg')
    expect(first.status).toBe(200)
    expect(first.headers.get('content-type')).toContain('image/svg+xml')
    expect(first.headers.get('cache-control')).toContain('immutable')
    expect(await first.text()).toBe(await repeated.text())
    expect(await tone.text()).toContain('#7a4930')
  })

  it('rejects malformed synthetic image specifications', async () => {
    expect((await app.request('/api/synthetic-images/not-a-symbol.svg')).status).toBe(404)
  })

  it('reports discovery catalog failures', async () => {
    const discoveryCatalog = {
      provider: 'meilisearch',
      health: async () => { throw new Error('unavailable') },
    } as unknown as DiscoveryCatalog
    const response = await createApp({ discoveryCatalog }).request('/api/health')
    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({ status: 'unavailable' })
  })
})

describe('Clerk-authenticated application API', () => {
  it('reports missing local Clerk configuration without affecting health', async () => {
    const response = await app.request('/api/app/session')

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({ error: 'authentication_unconfigured' })
    expect((await app.request('/api/health')).status).toBe(200)
  })

  it('returns the verified user and rejects invalid sessions', async () => {
    const appWithAuth = createApp({
      appSessionVerifier: {
        verify: async (request) => request.headers.get('authorization') === 'Bearer valid'
          ? { userId: 'user_example' }
          : null,
      },
    })

    const valid = await appWithAuth.request('/api/app/session', {
      headers: { Authorization: 'Bearer valid' },
    })
    const invalid = await appWithAuth.request('/api/app/session', {
      headers: { Authorization: 'Bearer invalid' },
    })

    expect(valid.status).toBe(200)
    await expect(valid.json()).resolves.toEqual({ user_id: 'user_example' })
    expect(invalid.status).toBe(401)
    await expect(invalid.json()).resolves.toEqual({ error: 'authentication_required' })
  })

  it('does not proxy unknown application routes to Rails', async () => {
    const response = await createApp({
      legacyServerUrl: 'http://127.0.0.1:1',
      appSessionVerifier: { verify: async () => ({ userId: 'user_example' }) },
    }).request('/api/app/not-a-route')

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'not_found' })
  })
})

describe('Clerk-owned character API', () => {
  const id = '10000000-0000-4000-8000-000000000001'
  const character: CharacterRecord = {
    id,
    clerkUserId: 'user_example',
    name: 'Sam',
    templateKey: 'base-character-prototype',
    templateVersion: 1,
    configurationVersion: 1,
    settings: { skinColour: 'medium', hairColour: 'dark-brown', shirtColour: 'green' },
    revision: 1,
    createdAt: '2026-08-03T12:00:00.000Z',
    updatedAt: '2026-08-03T12:00:00.000Z',
  }
  const write = {
    name: 'Sam',
    template_key: 'base-character-prototype',
    template_version: 1,
    configuration_version: 1,
    settings: { skin_colour: 'medium', hair_colour: 'dark-brown', shirt_colour: 'green' },
  }

  function setup(overrides: Partial<CharacterStore> = {}) {
    const store: CharacterStore = {
      listCharacters: vi.fn<CharacterStore['listCharacters']>(async () => ({ kind: 'ok', characters: [character] })),
      findCharacter: vi.fn<CharacterStore['findCharacter']>(async () => ({ kind: 'ok', character })),
      createCharacter: vi.fn<CharacterStore['createCharacter']>(async () => ({ kind: 'ok', character })),
      updateCharacter: vi.fn<CharacterStore['updateCharacter']>(async () => ({ kind: 'ok', character: { ...character, revision: 2 } })),
      deleteCharacter: vi.fn<CharacterStore['deleteCharacter']>(async () => ({ kind: 'deleted' })),
      deleteClerkUser: vi.fn(async () => undefined),
      ...overrides,
    }
    const characterApp = createApp({
      characterStore: store,
      appSessionVerifier: {
        verify: async (request) => request.headers.get('authorization') === 'Bearer valid'
          ? { userId: 'user_example' }
          : null,
      },
      characterId: () => id,
      appNow: () => new Date('2026-08-03T12:00:00.000Z'),
    })
    return { characterApp, store }
  }

  it('lists private characters and creates validated records', async () => {
    const { characterApp, store } = setup()
    const list = await characterApp.request('/api/app/characters', { headers: { Authorization: 'Bearer valid' } })
    expect(list.status).toBe(200)
    expect(list.headers.get('cache-control')).toBe('private, no-store')
    await expect(list.json()).resolves.toEqual({ characters: [expect.objectContaining({ id, name: 'Sam' })] })
    expect(store.listCharacters).toHaveBeenCalledWith('user_example', '2026-08-03T12:00:00.000Z')

    const created = await characterApp.request('/api/app/characters', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid', 'Content-Type': 'application/json' },
      body: JSON.stringify(write),
    })
    expect(created.status).toBe(201)
    expect(created.headers.get('location')).toBe(`/api/app/characters/${id}`)
    expect(store.createCharacter).toHaveBeenCalledWith(
      'user_example', id, expect.objectContaining({
        name: 'Sam',
        settings: { skinColour: 'medium', hairColour: 'dark-brown', shirtColour: 'green' },
      }), '2026-08-03T12:00:00.000Z',
    )
  })

  it('enforces authentication, validation, not-found, account, and conflict boundaries', async () => {
    const unauthenticated = setup().characterApp
    expect((await unauthenticated.request('/api/app/characters')).status).toBe(401)
    expect((await unauthenticated.request('/api/app/characters', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid', 'Content-Type': 'application/json' },
      body: '{}',
    })).status).toBe(422)
    expect((await unauthenticated.request('/api/app/characters', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid', 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...write, settings: { ...write.settings, shirt_colour: 'cyan' } }),
    })).status).toBe(422)
    expect((await unauthenticated.request('/api/app/characters/not-a-uuid', {
      headers: { Authorization: 'Bearer valid' },
    })).status).toBe(404)

    const conflict = setup({ updateCharacter: vi.fn<CharacterStore['updateCharacter']>(async () => ({ kind: 'conflict' })) }).characterApp
    const conflictResponse = await conflict.request(`/api/app/characters/${id}`, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer valid', 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...write, revision: 1 }),
    })
    expect(conflictResponse.status).toBe(409)
    await expect(conflictResponse.json()).resolves.toEqual({ error: 'character_conflict' })

    const deleted = setup({ listCharacters: vi.fn<CharacterStore['listCharacters']>(async () => ({ kind: 'account_deleted' })) }).characterApp
    expect((await deleted.request('/api/app/characters', { headers: { Authorization: 'Bearer valid' } })).status).toBe(403)
  })

  it('reads, updates, and deletes only through the scoped store', async () => {
    const { characterApp, store } = setup()
    expect((await characterApp.request(`/api/app/characters/${id}`, { headers: { Authorization: 'Bearer valid' } })).status).toBe(200)
    expect((await characterApp.request(`/api/app/characters/${id}`, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer valid', 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...write, revision: 1 }),
    })).status).toBe(200)
    expect((await characterApp.request(`/api/app/characters/${id}`, {
      method: 'DELETE', headers: { Authorization: 'Bearer valid' },
    })).status).toBe(204)
    expect(store.findCharacter).toHaveBeenCalledWith('user_example', id, expect.any(String))
    expect(store.updateCharacter).toHaveBeenCalledWith('user_example', id, expect.any(Object), 1, expect.any(String))
    expect(store.deleteCharacter).toHaveBeenCalledWith('user_example', id, expect.any(String))
  })

  it('verifies deletion webhooks, ignores other events, and retries database failures', async () => {
    const deleteClerkUser = vi.fn(async () => undefined)
    const store = setup({ deleteClerkUser }).store
    const webhook = createApp({
      characterStore: store,
      clerkWebhookVerifier: { verify: vi.fn(async () => ({ type: 'user.deleted', data: { id: 'user_example' } } as never)) },
      appNow: () => new Date('2026-08-03T12:00:00.000Z'),
    })
    expect((await webhook.request('/api/webhooks/clerk', { method: 'POST' })).status).toBe(200)
    expect(deleteClerkUser).toHaveBeenCalledWith('user_example', '2026-08-03T12:00:00.000Z')

    const invalid = createApp({
      characterStore: store,
      clerkWebhookVerifier: { verify: vi.fn(async () => { throw new Error('bad signature') }) },
    })
    expect((await invalid.request('/api/webhooks/clerk', { method: 'POST' })).status).toBe(400)

    const unavailable = createApp({
      characterStore: { ...store, deleteClerkUser: vi.fn(async () => { throw new Error('database') }) },
      clerkWebhookVerifier: { verify: vi.fn(async () => ({ type: 'user.deleted', data: { id: 'user_example' } } as never)) },
    })
    expect((await unavailable.request('/api/webhooks/clerk', { method: 'POST' })).status).toBe(503)
  })
})

describe('React site delivery', () => {
  const siteRoot = fileURLToPath(new URL('./test-fixtures/site', import.meta.url))

  it('serves static assets and falls back to the SPA for HTML routes', async () => {
    const siteApp = createApp({ siteRoot })
    const asset = await siteApp.request('/asset.txt')
    const route = await siteApp.request('/repositories/demo', {
      headers: { accept: 'text/html' },
    })
    const apiDocumentation = await siteApp.request('/api', {
      headers: { accept: 'text/html' },
    })

    expect(asset.status).toBe(200)
    await expect(asset.text()).resolves.toMatch(/^static asset\r?\n$/)
    expect(route.status).toBe(200)
    await expect(route.text()).resolves.toContain('Open Symbols test site')
    expect(apiDocumentation.status).toBe(200)
    await expect(apiDocumentation.text()).resolves.toContain('Open Symbols test site')
  })

  it('does not turn missing assets or API routes into HTML', async () => {
    const siteApp = createApp({ siteRoot })
    const asset = await siteApp.request('/missing.js', {
      headers: { accept: 'text/html' },
    })
    const api = await siteApp.request('/api/not-a-route', {
      headers: { accept: 'text/html' },
    })

    expect(asset.status).toBe(404)
    expect(api.status).toBe(404)
    expect(api.headers.get('content-type')).toContain('application/json')
    await expect(api.json()).resolves.toEqual({ error: 'not_found' })
  })
})
