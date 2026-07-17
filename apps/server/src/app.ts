import { Hono } from 'hono'
import { createLegacyProxy } from './legacy-proxy.js'

export interface AppOptions {
  legacyServerUrl?: string
  legacyServerTimeoutMs?: number
}

function legacyTimeoutFromEnvironment() {
  const value = Number.parseInt(process.env.LEGACY_SERVER_TIMEOUT_MS ?? '10000', 10)

  if (!Number.isInteger(value) || value < 1) {
    throw new Error('LEGACY_SERVER_TIMEOUT_MS must be a positive integer')
  }

  return value
}

export function createApp(options: AppOptions = {}) {
  const app = new Hono()
  const legacyProxy = createLegacyProxy({
    serverUrl:
      options.legacyServerUrl ??
      process.env.LEGACY_SERVER_URL ??
      'http://127.0.0.1:3001',
    timeoutMs: options.legacyServerTimeoutMs ?? legacyTimeoutFromEnvironment(),
  })

  app.get('/api/health', (context) => context.json({ status: 'ok' as const }))

  app.all('/api/v1/*', legacyProxy)
  app.all('/api/v2/*', legacyProxy)
  app.all('/auth/coughdrop/*', legacyProxy)
  app.all('/login', legacyProxy)
  app.all('/admin', legacyProxy)
  app.all('/admin/*', legacyProxy)
  app.all('/stats', legacyProxy)

  return app
}

export const app = createApp()
