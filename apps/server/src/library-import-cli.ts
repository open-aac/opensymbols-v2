import { hostname } from 'node:os'
import { parseArgs } from 'node:util'
import { Pool } from 'pg'
import { databaseUrlFromEnvironment } from './database-config.js'
import { LibraryImportEngine } from './library-import-engine.js'
import { libraryImportSchemaSql } from './library-import-schema.js'
import { importObjectStorageFromEnvironment } from './library-import-storage.js'
import { createPostgresImportDraftStore } from './library-import-store.js'

const [command] = process.argv.slice(2)
const { values } = parseArgs({
  args: process.argv.slice(3),
  options: {
    actor: { type: 'string' },
    worker: { type: 'string' },
  },
  strict: true,
})

if (!['schema', 'work-once', 'expire'].includes(command ?? '')) {
  throw new Error('Usage: import:drafts <schema|work-once|expire> [--actor <Clerk user id>] [--worker <id>]')
}

const connectionString = databaseUrlFromEnvironment()
if (command === 'schema') {
  const pool = new Pool({ connectionString })
  try {
    await pool.query(libraryImportSchemaSql)
    process.stdout.write('Draft import schema is ready.\n')
  } finally {
    await pool.end()
  }
} else {
  const store = createPostgresImportDraftStore(connectionString)
  const storage = importObjectStorageFromEnvironment()
  if (!storage) throw new Error('IMPORT_QUARANTINE_BUCKET is required')
  const engine = new LibraryImportEngine(store, storage)
  try {
    if (command === 'work-once') {
      const worker = values.worker ?? `${hostname()}:${process.pid}`
      const result = await engine.processNextValidation(worker)
      process.stdout.write(result ? `Processed import ${result.importId}: ${result.status}.\n` : 'No validation job is ready.\n')
    } else {
      if (!values.actor) throw new Error('--actor is required for expiry audit attribution')
      const result = await engine.expireDrafts(values.actor)
      process.stdout.write(`Expired ${result.expired.length} drafts; ${result.cleanupFailures.length} cleanup failures.\n`)
      if (result.cleanupFailures.length > 0) process.exitCode = 1
    }
  } finally {
    await store.close()
  }
}
