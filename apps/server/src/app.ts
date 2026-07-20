import { existsSync } from 'node:fs'
import { Hono, type Context } from 'hono'
import { serveStatic } from '@hono/node-server/serve-static'
import { createLegacyProxy } from './legacy-proxy.js'
import {
  findPublicRepository,
  findPublicSymbol,
  listPublicRepositories,
  type PublicReadImageOptions,
} from './public-read-api.js'
import type { PublicReadStore } from './public-read-store.js'
import type { AppSessionVerifier } from './clerk-auth.js'

export interface AppOptions {
  legacyServerUrl?: string
  legacyServerTimeoutMs?: number
  publicReadStore?: PublicReadStore
  s3Bucket?: string
  s3Cdn?: string
  siteRoot?: string
  appSessionVerifier?: AppSessionVerifier
}

function hasLegacyCredentials(context: Context) {
  const url = new URL(context.req.url)
  return context.req.raw.headers.has('authorization') ||
    url.searchParams.has('access_token') ||
    url.searchParams.has('search_token')
}

function isPublicReadPath(path: string) {
  return path === '/api/v2/repositories' ||
    /^\/api\/v2\/repositories\/[^/]+$/.test(path) ||
    /^\/api\/v2\/symbols\/[^/]+\/[^/]+$/.test(path)
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

  app.get('/api/app/session', async (context) => {
    if (!options.appSessionVerifier) {
      return context.json({ error: 'authentication_unconfigured' as const }, 503)
    }

    const session = await options.appSessionVerifier.verify(context.req.raw)
    if (!session) {
      return context.json({ error: 'authentication_required' as const }, 401)
    }

    return context.json({ user_id: session.userId })
  })

  app.all('/api/app/*', (context) => context.json({ error: 'not_found' as const }, 404))

  if (options.publicReadStore) {
    const store = options.publicReadStore
    const imageOptions: PublicReadImageOptions = {
      s3Bucket: options.s3Bucket,
      s3Cdn: options.s3Cdn,
    }

    app.use('/api/v2/*', (context, next) => {
      if (context.req.method !== 'GET' && isPublicReadPath(context.req.path)) {
        return legacyProxy(context)
      }
      return next()
    })

    app.get('/api/v2/repositories', async (context) => {
      if (hasLegacyCredentials(context)) return legacyProxy(context)
      try {
        return context.json({ repositories: await listPublicRepositories(store) })
      } catch {
        return context.json({ error: 'database_unavailable' as const }, 503)
      }
    })

    app.get('/api/v2/repositories/:repoKey', async (context) => {
      if (hasLegacyCredentials(context)) return legacyProxy(context)
      try {
        const repoKey = context.req.param('repoKey')
        const repository = await findPublicRepository(store, repoKey)
        if (!repository) return context.json({ error: 'not found', id: repoKey }, 404)
        return context.json({ repository })
      } catch {
        return context.json({ error: 'database_unavailable' as const }, 503)
      }
    })

    app.get('/api/v2/symbols/:repoKey/:symbolKey', async (context) => {
      if (hasLegacyCredentials(context)) return legacyProxy(context)
      try {
        const result = await findPublicSymbol(
          store,
          context.req.param('repoKey'),
          context.req.param('symbolKey'),
          imageOptions,
        )
        if (result.kind === 'not_found') {
          return context.json({ error: 'not found', id: result.id }, 404)
        }
        return context.json({ symbol: result.symbol })
      } catch {
        return context.json({ error: 'database_unavailable' as const }, 503)
      }
    })
  }

  app.all('/api/v1/*', legacyProxy)
  app.all('/api/v2/*', legacyProxy)
  app.all('/auth/coughdrop/*', legacyProxy)
  app.all('/login', legacyProxy)
  app.all('/admin', legacyProxy)
  app.all('/admin/*', legacyProxy)
  app.all('/stats', legacyProxy)

  app.all('/api/*', (context, next) => {
    if (context.req.path === '/api') return next()
    return context.json({ error: 'not_found' as const }, 404)
  })

  if (options.siteRoot && existsSync(options.siteRoot)) {
    const staticFiles = serveStatic({ root: options.siteRoot })
    const siteIndex = serveStatic({ root: options.siteRoot, path: 'index.html' })

    app.use('*', staticFiles)
    app.get('*', async (context, next) => {
      const acceptsHtml = context.req.header('accept')?.includes('text/html') ?? false
      const hasFileExtension = /\/[^/]+\.[^/]+$/.test(context.req.path)

      if (!acceptsHtml || hasFileExtension) return next()
      return siteIndex(context, next)
    })
  }

  return app
}

export const app = createApp()
