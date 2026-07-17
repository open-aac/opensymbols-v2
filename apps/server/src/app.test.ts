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

describe('React site delivery', () => {
  const siteRoot = fileURLToPath(new URL('./test-fixtures/site', import.meta.url))

  it('serves static assets and falls back to the SPA for HTML routes', async () => {
    const siteApp = createApp({ siteRoot })
    const asset = await siteApp.request('/asset.txt')
    const route = await siteApp.request('/repositories/demo', {
      headers: { accept: 'text/html' },
    })

    expect(asset.status).toBe(200)
    await expect(asset.text()).resolves.toBe('static asset\n')
    expect(route.status).toBe(200)
    await expect(route.text()).resolves.toContain('Open Symbols test site')
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
