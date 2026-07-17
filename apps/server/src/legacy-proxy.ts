import type { Handler } from 'hono'
import { proxy } from 'hono/proxy'

export interface LegacyProxyOptions {
  serverUrl: string
  timeoutMs: number
}

function normalizeServerUrl(serverUrl: string) {
  const url = new URL(serverUrl)

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('LEGACY_SERVER_URL must use http or https')
  }

  url.pathname = `${url.pathname.replace(/\/$/, '')}/`
  url.search = ''
  url.hash = ''
  return url
}

export function createLegacyProxy(options: LegacyProxyOptions): Handler {
  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1) {
    throw new Error('LEGACY_SERVER_TIMEOUT_MS must be a positive integer')
  }

  const serverUrl = normalizeServerUrl(options.serverUrl)

  return async (context) => {
    const requestUrl = new URL(context.req.url)
    const targetUrl = new URL(`${requestUrl.pathname}${requestUrl.search}`, serverUrl)
    const headers = new Headers(context.req.raw.headers)

    headers.delete('host')
    headers.set('x-forwarded-host', requestUrl.host)
    headers.set('x-forwarded-proto', requestUrl.protocol.replace(':', ''))

    try {
      return await proxy(targetUrl, {
        raw: context.req.raw,
        headers,
        redirect: 'manual',
        signal: AbortSignal.timeout(options.timeoutMs),
      })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'TimeoutError') {
        return context.json({ error: 'legacy_server_timeout' as const }, 504)
      }

      return context.json({ error: 'legacy_server_unavailable' as const }, 502)
    }
  }
}
