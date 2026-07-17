import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from './app.js'

let upstream: Server
let upstreamUrl: string

beforeAll(async () => {
  upstream = createServer((request, response) => {
    if (request.url?.startsWith('/api/v1/slow')) {
      setTimeout(() => {
        response.writeHead(200).end('late')
      }, 100)
      return
    }

    if (request.url?.startsWith('/api/v2/redirect')) {
      response.writeHead(307, { location: '/login' }).end()
      return
    }

    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => chunks.push(chunk))
    request.on('end', () => {
      response.writeHead(201, {
        'content-type': 'application/json',
        'set-cookie': 'legacy_session=abc; Path=/; HttpOnly',
        'x-legacy-response': 'preserved',
      })
      response.end(
        JSON.stringify({
          method: request.method,
          url: request.url,
          body: Buffer.concat(chunks).toString('utf8'),
          authorization: request.headers.authorization,
          cookie: request.headers.cookie,
          forwardedHost: request.headers['x-forwarded-host'],
          forwardedProto: request.headers['x-forwarded-proto'],
        }),
      )
    })
  })

  await new Promise<void>((resolve) => {
    upstream.listen(0, '127.0.0.1', resolve)
  })

  const address = upstream.address() as AddressInfo
  upstreamUrl = `http://127.0.0.1:${address.port}`
})

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    upstream.close((error) => (error ? reject(error) : resolve()))
  })
})

describe('legacy route gateway', () => {
  it('preserves the request and upstream response', async () => {
    const app = createApp({ legacyServerUrl: upstreamUrl })
    const response = await app.request('/api/v1/echo?locale=en', {
      method: 'POST',
      headers: {
        authorization: 'Bearer example',
        'content-type': 'application/json',
        cookie: 'auth=secret',
      },
      body: JSON.stringify({ phrase: 'hello' }),
    })

    expect(response.status).toBe(201)
    expect(response.headers.get('set-cookie')).toContain('legacy_session=abc')
    expect(response.headers.get('x-legacy-response')).toBe('preserved')
    await expect(response.json()).resolves.toMatchObject({
      method: 'POST',
      url: '/api/v1/echo?locale=en',
      body: '{"phrase":"hello"}',
      authorization: 'Bearer example',
      cookie: 'auth=secret',
      forwardedProto: 'http',
    })
  })

  it('returns upstream redirects without following them', async () => {
    const app = createApp({ legacyServerUrl: upstreamUrl })
    const response = await app.request('/api/v2/redirect')

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('/login')
  })

  it.each([
    '/api/v1/token_check',
    '/api/v2/repositories',
    '/auth/coughdrop/example',
    '/login',
    '/admin',
    '/admin/repositories/demo',
    '/stats',
  ])('forwards approved legacy route %s', async (path) => {
    const app = createApp({ legacyServerUrl: upstreamUrl })
    const response = await app.request(path)

    expect(response.status).toBe(201)
  })

  it('returns a stable timeout response', async () => {
    const app = createApp({
      legacyServerUrl: upstreamUrl,
      legacyServerTimeoutMs: 10,
    })
    const response = await app.request('/api/v1/slow')

    expect(response.status).toBe(504)
    await expect(response.json()).resolves.toEqual({
      error: 'legacy_server_timeout',
    })
  })

  it('returns a stable unavailable response', async () => {
    const app = createApp({
      legacyServerUrl: 'http://127.0.0.1:1',
      legacyServerTimeoutMs: 100,
    })
    const response = await app.request('/api/v1/repositories')

    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toEqual({
      error: 'legacy_server_unavailable',
    })
  })

  it.each([
    '/',
    '/search',
    '/repositories/demo',
    '/symbols/demo/hello',
    '/api',
    '/editor',
    '/core',
    '/badge_maker',
    '/word_maker',
    '/word_art',
  ])('does not forward retired Rails route %s', async (path) => {
    const app = createApp({ legacyServerUrl: upstreamUrl })
    const response = await app.request(path)

    expect(response.status).toBe(404)
  })
})
