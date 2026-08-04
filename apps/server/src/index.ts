import { fileURLToPath } from 'node:url'
import { serve } from '@hono/node-server'
import { createApp } from './app.js'
import { databaseUrlFromEnvironment } from './database-config.js'
import { createPostgresPublicReadStore } from './public-read-store.js'
import { clerkSessionVerifierFromEnvironment } from './clerk-auth.js'
import { clerkWebhookVerifierFromEnvironment } from './clerk-webhook.js'
import { discoveryCatalogFromEnvironment } from './discovery-config.js'

const port = Number.parseInt(process.env.PORT ?? '3000', 10)
const siteRoot = process.env.SITE_DIST_PATH ?? fileURLToPath(new URL('../../site/dist', import.meta.url))
const publicReadStore = createPostgresPublicReadStore({
  connectionString: databaseUrlFromEnvironment(),
  encryptionKey: process.env.SECURE_ENCRYPTION_KEY,
})
const imageOptions = { s3Bucket: process.env.S3_BUCKET, s3Cdn: process.env.S3_CDN }
const discoveryCatalog = discoveryCatalogFromEnvironment(publicReadStore, imageOptions)
await discoveryCatalog.health()
const app = createApp({
  siteRoot,
  publicReadStore,
  discoveryCatalog,
  symbolRequestStore: publicReadStore,
  publicApiStore: publicReadStore,
  publicApiEncryptionKey: process.env.SECURE_ENCRYPTION_KEY,
  ...imageOptions,
  appSessionVerifier: clerkSessionVerifierFromEnvironment(),
  clerkWebhookVerifier: clerkWebhookVerifierFromEnvironment(),
  characterStore: publicReadStore,
})

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error('PORT must be an integer between 1 and 65535')
}

const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(`OpenSymbols server listening on http://localhost:${info.port}`)
})

let shuttingDown = false

function shutdown(signal: string) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`Received ${signal}; shutting down`)
  server.close(async (error) => {
    try {
      await discoveryCatalog.close()
      await publicReadStore.close()
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
