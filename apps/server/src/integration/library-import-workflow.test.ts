import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Pool } from 'pg'
import { ZipFile } from 'yazl'
import { describe, expect, it } from 'vitest'
import { createApp } from '../app.js'
import { catalogSchemaSql } from '../catalog-schema.js'
import { LibraryImportEngine } from '../library-import-engine.js'
import { LocalImportObjectStorage } from '../library-import-local-storage.js'
import { libraryImportSchemaSql } from '../library-import-schema.js'
import { PostgresImportDraftStore } from '../library-import-store.js'

const databaseIntegration = process.env.RUN_DATABASE_INTEGRATION === '1' ? describe : describe.skip

function adminDatabaseUrl() {
  if (process.env.DATABASE_ADMIN_URL) return process.env.DATABASE_ADMIN_URL
  const user = encodeURIComponent(process.env.POSTGRES_USER ?? 'opensymbols')
  const password = encodeURIComponent(process.env.POSTGRES_PASSWORD ?? 'opensymbols')
  const port = process.env.POSTGRES_PORT ?? '5432'
  return `postgresql://${user}:${password}@127.0.0.1:${port}/postgres`
}

function zip() {
  return new Promise<Buffer>((resolve, reject) => {
    const archive = new ZipFile(); const chunks: Buffer[] = []
    archive.outputStream.on('data', (chunk: Buffer) => chunks.push(chunk))
    archive.outputStream.once('error', reject)
    archive.outputStream.once('end', () => resolve(Buffer.concat(chunks)))
    archive.addBuffer(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/><path id="safe"/></svg>'), 'hello.svg', { compress: false })
    archive.end()
  })
}

databaseIntegration('administrator import workflow integration', () => {
  it('creates, uploads, durably validates, and reviews a private draft through Hono', async () => {
    const databaseName = `opensymbols_import_flow_${process.pid}_${Date.now()}`
    const admin = new Pool({ connectionString: adminDatabaseUrl() })
    const storageRoot = await mkdtemp(join(tmpdir(), 'opensymbols-import-flow-'))
    let store: PostgresImportDraftStore | undefined
    try {
      await admin.query(`CREATE DATABASE "${databaseName}"`)
      const url = new URL(adminDatabaseUrl()); url.pathname = `/${databaseName}`
      const pool = new Pool({ connectionString: url.toString() })
      await pool.query(catalogSchemaSql); await pool.query(libraryImportSchemaSql)
      store = new PostgresImportDraftStore(pool)
      const storage = new LocalImportObjectStorage(storageRoot, () => new Date('2026-08-13T10:00:00.000Z'))
      const engine = new LibraryImportEngine(store, storage, { now: () => new Date('2026-08-13T10:00:00.000Z') })
      const app = createApp({
        appSessionVerifier: { verify: async () => ({ userId: 'admin_one', administrator: true }) },
        importDraftStore: store, importObjectStorage: storage, libraryImportEngine: engine,
      })
      const headers = { Authorization: 'Bearer valid', 'Content-Type': 'application/json' }
      const created = await app.request('/api/app/admin/imports', {
        method: 'POST', headers, body: JSON.stringify({
          kind: 'new_library', repository_id: null, repository_key: 'demo', repository_name: 'Demo Library',
          default_license: 'CC BY', license_url: 'https://example.test/license', attribution_name: 'Example Artist',
        }),
      })
      expect(created.status).toBe(201)
      const createdBody = await created.json() as { draft: { id: string }; upload: { url: string } }
      const uploaded = await app.request(createdBody.upload.url, {
        method: 'PUT', headers: { Authorization: 'Bearer valid', 'Content-Type': 'application/zip' }, body: await zip(),
      })
      expect(uploaded.status).toBe(204)
      expect((await app.request(`/api/app/admin/imports/${createdBody.draft.id}/complete-upload`, {
        method: 'POST', headers: { Authorization: 'Bearer valid' },
      })).status).toBe(202)
      await expect(engine.processNextValidation('integration-worker')).resolves.toEqual({
        importId: createdBody.draft.id, status: 'review_ready',
      })
      const reviewed = await app.request(`/api/app/admin/imports/${createdBody.draft.id}`, {
        headers: { Authorization: 'Bearer valid' },
      })
      const review = await reviewed.json() as { import: { status: string; files: unknown[]; results: Array<{ code: string }> } }
      expect(review.import.status).toBe('review_ready')
      expect(review.import.files).toHaveLength(1)
      expect(review.import.results).toContainEqual(expect.objectContaining({ code: 'svg_content_removed' }))
      expect(JSON.stringify(review)).not.toContain(storageRoot)
    } finally {
      if (store) await store.close()
      await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`)
      await admin.end(); await rm(storageRoot, { recursive: true, force: true })
    }
  })
})
