import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { app, createApp } from './app.js'

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
