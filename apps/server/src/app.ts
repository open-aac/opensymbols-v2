import { existsSync } from 'node:fs'
import { Hono } from 'hono'
import { serveStatic } from '@hono/node-server/serve-static'
import {
  findPublicRepository,
  findPublicSymbol,
  listPublicRepositories,
  type PublicReadImageOptions,
} from './public-read-api.js'
import {
  searchPublicSymbols,
  submitPublicSymbolRequest,
} from './public-discovery-api.js'
import type { PublicDiscoveryStore, PublicReadStore } from './public-read-store.js'
import type { PublicApiStore } from './public-read-store.js'
import {
  createSharedSecret,
  exchangeSharedSecret,
  securePublicApiNonce,
  validateSharedSecretApplication,
  verifyAccessToken,
  type PublicApiNonce,
} from './public-api-auth.js'
import type { AppSessionVerifier } from './clerk-auth.js'
import type { DiscoveryCatalog } from './discovery-catalog.js'
import { PostgresDiscoveryCatalog } from './discovery-catalog.js'

export interface AppOptions {
  legacyServerUrl?: string
  legacyServerTimeoutMs?: number
  publicReadStore?: PublicReadStore
  publicDiscoveryStore?: PublicDiscoveryStore
  discoveryCatalog?: DiscoveryCatalog
  symbolRequestStore?: PublicDiscoveryStore
  publicApiStore?: PublicApiStore
  publicApiEncryptionKey?: string
  publicApiNow?: () => Date
  publicApiNonce?: PublicApiNonce
  s3Bucket?: string
  s3Cdn?: string
  siteRoot?: string
  appSessionVerifier?: AppSessionVerifier
}

export function createApp(options: AppOptions = {}) {
  const app = new Hono()
  const imageOptions: PublicReadImageOptions = {
    s3Bucket: options.s3Bucket,
    s3Cdn: options.s3Cdn,
  }
  const catalogStore = options.publicDiscoveryStore ?? options.publicApiStore
  const catalog = options.discoveryCatalog ?? (
    catalogStore ? new PostgresDiscoveryCatalog(catalogStore, imageOptions) : undefined
  )
  const symbolRequestStore = options.symbolRequestStore ?? options.publicDiscoveryStore

  app.get('/api/health', async (context) => {
    try {
      await catalog?.health()
      return context.json({ status: 'ok' as const })
    } catch {
      return context.json({ status: 'unavailable' as const }, 503)
    }
  })

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

  if (catalog || options.publicReadStore) {
    const store = options.publicReadStore

    app.get('/api/v2/repositories', async (context) => {
      try {
        const repositories = catalog
          ? await catalog.listRepositories()
          : await listPublicRepositories(store!)
        return context.json({ repositories })
      } catch {
        return context.json({ error: 'database_unavailable' as const }, 503)
      }
    })

    app.get('/api/v2/repositories/:repoKey', async (context) => {
      try {
        const repoKey = context.req.param('repoKey')
        const repository = catalog
          ? await catalog.findRepository(repoKey)
          : await findPublicRepository(store!, repoKey)
        if (!repository) return context.json({ error: 'not found', id: repoKey }, 404)
        return context.json({ repository })
      } catch {
        return context.json({ error: 'database_unavailable' as const }, 503)
      }
    })

    app.get('/api/v2/symbols/:repoKey/:symbolKey', async (context) => {
      try {
        const result = catalog
          ? await catalog.findSymbol(context.req.param('repoKey'), context.req.param('symbolKey'))
          : await findPublicSymbol(
              store!,
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

  if (catalog) {
    const page = (value: string | undefined) => {
      const parsed = Number.parseInt(value ?? '0', 10)
      return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0
    }

    app.get('/api/v1/symbols/random', async (context) => {
      try {
        return context.json(await catalog.randomSymbols())
      } catch {
        return context.json({ error: 'database_unavailable' as const }, 503)
      }
    })

    app.get('/api/v1/repositories/:repoKey/symbols', async (context) => {
      try {
        const result = await catalog.listRepositorySymbols(context.req.param('repoKey'), {
          page: page(context.req.query('page')),
          unsafe: context.req.query('unsafe') === '1',
          hasSkin: context.req.query('has_skin') === '1',
        })
        if (result.kind === 'not_found') return context.json({ error: 'not found' }, 404)
        return context.json({
          symbols: result.symbols,
          ...(result.nextUrl ? { meta: { next_url: result.nextUrl } } : {}),
        })
      } catch {
        return context.json({ error: 'database_unavailable' as const }, 503)
      }
    })

    app.get('/api/v1/symbols/search', async (context) => {
      try {
        return context.json(await catalog.searchSymbols({
          query: context.req.query('q') ?? '',
          locale: context.req.query('locale'),
          safe: context.req.query('safe') !== '0',
          page: page(context.req.query('page')),
        }))
      } catch {
        return context.json({ error: 'database_unavailable' as const }, 503)
      }
    })

  }

  if (symbolRequestStore) {
    app.post('/api/v1/symbols/requests', async (context) => {
      let input: unknown
      try {
        input = await context.req.json()
      } catch {
        return context.json({ error: 'invalid symbol request' }, 422)
      }
      if (!input || Array.isArray(input) || typeof input !== 'object') {
        return context.json({ error: 'invalid symbol request' }, 422)
      }
      try {
        const submitted = await submitPublicSymbolRequest(
          symbolRequestStore,
          input as { name?: unknown; first_letter?: unknown; comments?: unknown },
          new Date().toISOString(),
        )
        if (!submitted) return context.json({ error: 'invalid symbol request' }, 422)
        return context.json({ submitted: true as const })
      } catch {
        return context.json({ error: 'database_unavailable' as const }, 503)
      }
    })
  }

  if (options.publicApiStore) {
    const store = options.publicApiStore
    const now = options.publicApiNow ?? (() => new Date())
    const nonce = options.publicApiNonce ?? securePublicApiNonce
    const encryptionKey = options.publicApiEncryptionKey ?? process.env.SECURE_ENCRYPTION_KEY
    const formBody = async (context: { req: { parseBody(): Promise<Record<string, unknown>> } }) => {
      try {
        return await context.req.parseBody()
      } catch {
        return null
      }
    }

    app.post('/api/v2/generate_secret', async (context) => {
      const body = await formBody(context)
      const application = body ? validateSharedSecretApplication(body) : null
      if (!application) {
        return context.json({ error: 'organization, valid email, and purpose are required' }, 422)
      }
      try {
        const sharedSecret = await createSharedSecret(store, application, now(), nonce)
        return context.json({ shared_secret: sharedSecret })
      } catch {
        return context.json({ error: 'database_unavailable' as const }, 503)
      }
    })

    app.post('/api/v2/token', async (context) => {
      const body = await formBody(context)
      const sharedSecret = typeof body?.secret === 'string' ? body.secret.trim() : ''
      if (!sharedSecret) return context.json({ error: 'secret required' }, 400)
      if (!encryptionKey) return context.json({ error: 'authentication_unconfigured' as const }, 503)
      if (sharedSecret.startsWith('temp')) return context.json({ error: 'invalid token' }, 400)
      try {
        const result = await exchangeSharedSecret(store, sharedSecret, now(), nonce, encryptionKey)
        if (!result) return context.json({ error: 'invalid token' }, 400)
        return context.json(result)
      } catch {
        return context.json({ error: 'database_unavailable' as const }, 503)
      }
    })

    app.get('/api/v2/symbols', async (context) => {
      if (!encryptionKey) return context.json({ error: 'authentication_unconfigured' as const }, 503)
      const token = context.req.header('authorization') ?? context.req.query('access_token')
      if (!token) return context.json({ error: 'invalid token' }, 400)
      try {
        const verification = await verifyAccessToken(store, token, now(), encryptionKey)
        if (verification.kind === 'expired') {
          return context.json({ error: 'token expired', token_expired: true }, 401)
        }
        if (verification.kind === 'invalid') {
          return context.json({ error: 'invalid access token', invalid_token: true }, 400)
        }
        context.header('Authorized', 'true')
        const pageValue = Number.parseInt(context.req.query('page') ?? '0', 10)
        const results = catalog
          ? await catalog.searchSymbols({
              query: context.req.query('q') ?? '',
              locale: context.req.query('locale'),
              safe: context.req.query('safe') !== '0',
              page: Number.isInteger(pageValue) && pageValue >= 0 ? pageValue : 0,
            })
          : await searchPublicSymbols(store, {
          query: context.req.query('q') ?? '',
          locale: context.req.query('locale'),
          safe: context.req.query('safe') !== '0',
          page: Number.isInteger(pageValue) && pageValue >= 0 ? pageValue : 0,
          image: imageOptions,
        })
        return context.json(results)
      } catch {
        return context.json({ error: 'database_unavailable' as const }, 503)
      }
    })
  }

  app.get('/api/synthetic-images/:spec', (context) => {
    const spec = context.req.param('spec')
    const match = /^(\d{7})(?:-(varianted-skin|variant-(light|medium-light|medium|medium-dark|dark)))?\.svg$/.exec(spec)
    if (!match) return context.json({ error: 'not_found' as const }, 404)
    const id = Number.parseInt(match[1]!, 10)
    const tone = match[3]
    const colors: Record<string, string> = {
      light: '#f3d2b3',
      'medium-light': '#d7a77b',
      medium: '#ae724c',
      'medium-dark': '#7a4930',
      dark: '#4a2b20',
    }
    const foreground = tone ? colors[tone]! : `hsl(${id % 360} 58% 44%)`
    const label = String(id).padStart(7, '0')
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" role="img" aria-label="Synthetic symbol ${label}"><rect width="256" height="256" rx="28" fill="#f8fafc"/><circle cx="128" cy="104" r="62" fill="${foreground}"/><path d="M56 220c8-48 38-72 72-72s64 24 72 72" fill="${foreground}"/><text x="128" y="242" text-anchor="middle" font-family="system-ui,sans-serif" font-size="18" fill="#172033">${label}</text></svg>`
    return context.body(svg, 200, {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    })
  })

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
