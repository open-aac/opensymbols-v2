import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { serve } from '@hono/node-server'
import { createApp } from './app.js'
import { databaseUrlFromEnvironment } from './database-config.js'
import { createPostgresPublicReadStore } from './public-read-store.js'
import { clerkSessionVerifierFromEnvironment } from './clerk-auth.js'
import { clerkWebhookVerifierFromEnvironment } from './clerk-webhook.js'
import { discoveryCatalogFromEnvironment } from './discovery-config.js'
import { LibraryImportEngine } from './library-import-engine.js'
import { LocalImportObjectStorage } from './library-import-local-storage.js'
import { importObjectStorageFromEnvironment } from './library-import-storage.js'
import { createPostgresImportDraftStore } from './library-import-store.js'

const port = Number.parseInt(process.env.PORT ?? '3000', 10)
const siteRoot = process.env.SITE_DIST_PATH ?? fileURLToPath(new URL('../../site/dist', import.meta.url))
const publicReadStore = createPostgresPublicReadStore({
  connectionString: databaseUrlFromEnvironment(),
})
const imageOptions = { s3Bucket: process.env.S3_BUCKET, s3Cdn: process.env.S3_CDN }
const discoveryCatalog = discoveryCatalogFromEnvironment(publicReadStore, imageOptions)
await discoveryCatalog.health()
const connectionString = databaseUrlFromEnvironment()
const importDraftStore = createPostgresImportDraftStore(connectionString)
const configuredImportObjectStorage = importObjectStorageFromEnvironment()
if (!configuredImportObjectStorage && process.env.NODE_ENV === 'production') {
  throw new Error('Private import quarantine storage is required in production')
}
const importObjectStorage = configuredImportObjectStorage ?? new LocalImportObjectStorage(
  resolve(process.env.IMPORT_QUARANTINE_LOCAL_ROOT ?? '.import-quarantine'),
)
const libraryImportEngine = new LibraryImportEngine(importDraftStore, importObjectStorage)
const app = createApp({
  siteRoot,
  publicReadStore,
  discoveryCatalog,
  symbolRequestStore: publicReadStore,
  publicApiStore: publicReadStore,
  publicApiTokenSigningKey: process.env.PUBLIC_API_TOKEN_SIGNING_KEY,
  publicApiLegacyTokenVerificationKey: process.env.PUBLIC_API_LEGACY_TOKEN_VERIFICATION_KEY,
  ...imageOptions,
  appSessionVerifier: clerkSessionVerifierFromEnvironment(),
  clerkWebhookVerifier: clerkWebhookVerifierFromEnvironment(),
  characterStore: publicReadStore,
  importDraftStore,
  importObjectStorage,
  libraryImportEngine,
})

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error('PORT must be an integer between 1 and 65535')
}

const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(`OpenSymbols server listening on http://localhost:${info.port}`)
})

let importWorkerRunning = false
const importWorker = setInterval(() => {
  if (importWorkerRunning) return
  importWorkerRunning = true
  libraryImportEngine.processNextValidation(`server:${process.pid}`)
    .catch((error) => console.error('Library import validation failed', error))
    .finally(() => { importWorkerRunning = false })
}, 1_000)
importWorker.unref()

let shuttingDown = false

function shutdown(signal: string) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`Received ${signal}; shutting down`)
  server.close(async (error) => {
    try {
      clearInterval(importWorker)
      await discoveryCatalog.close()
      await publicReadStore.close()
      await importDraftStore.close()
    } catch (databaseError) {
      console.error(databaseError)
      process.exitCode = 1
    }
    if (error) {
      console.error(error)
      process.exitCode = 1
    }
  })
}

process.once('SIGINT', () => shutdown('SIGINT'))
process.once('SIGTERM', () => shutdown('SIGTERM'))
