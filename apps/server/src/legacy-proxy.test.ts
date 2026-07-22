import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from './app.js'

let upstream: ReturnType<typeof createServer>
let upstreamUrl: string
let upstreamRequests = 0

beforeAll(async () => {
  upstream = createServer((_request, response) => {
    upstreamRequests += 1
    response.writeHead(200).end('legacy')
  })
  await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve))
  upstreamUrl = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`
})

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    upstream.close((error) => error ? reject(error) : resolve()))
})

describe('legacy route gateway', () => {
  it.each([
    ['POST', '/api/v2/generate_secret'],
    ['POST', '/api/v2/token'],
    ['GET', '/api/v2/symbols?q=hello'],
    ['GET', '/api/v1/symbols/search?q=hello'],
  ])('does not proxy unconfigured %s route %s', async (method, path) => {
    const response = await createApp({ legacyServerUrl: upstreamUrl }).request(path, { method })
    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'not_found' })
    expect(upstreamRequests).toBe(0)
  })
})
