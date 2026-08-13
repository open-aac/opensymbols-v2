import { Pool } from 'pg'
import { describe, expect, it } from 'vitest'
import { catalogSchemaSql } from '../catalog-schema.js'
import { libraryImportSchemaSql } from '../library-import-schema.js'
import { ImportStateConflictError, PostgresImportDraftStore } from '../library-import-store.js'

const databaseIntegration = process.env.RUN_DATABASE_INTEGRATION === '1' ? describe : describe.skip

function adminDatabaseUrl() {
  if (process.env.DATABASE_ADMIN_URL) return process.env.DATABASE_ADMIN_URL
  const user = encodeURIComponent(process.env.POSTGRES_USER ?? 'opensymbols')
  const password = encodeURIComponent(process.env.POSTGRES_PASSWORD ?? 'opensymbols')
  const port = process.env.POSTGRES_PORT ?? '5432'
  return `postgresql://${user}:${password}@127.0.0.1:${port}/postgres`
}

databaseIntegration('PostgresImportDraftStore integration', () => {
  it('persists shared drafts, leases jobs safely, audits actors, and expires drafts', async () => {
    const databaseName = `opensymbols_import_test_${process.pid}_${Date.now()}`
    const admin = new Pool({ connectionString: adminDatabaseUrl() })
    let database: Pool | undefined
    let store: PostgresImportDraftStore | undefined
    try {
      await admin.query(`CREATE DATABASE "${databaseName}"`)
      const url = new URL(adminDatabaseUrl())
      url.pathname = `/${databaseName}`
      database = new Pool({ connectionString: url.toString() })
      await database.query(catalogSchemaSql)
      await database.query(libraryImportSchemaSql)
      store = new PostgresImportDraftStore(database)

      const importId = '11111111-1111-4111-8111-111111111111'
      const jobTime = '2026-08-13T10:00:00.000Z'
      await store.createDraft({
        id: importId,
        kind: 'new_library',
        repositoryId: null,
        uploadObjectKey: `imports/${importId}/source.zip`,
        actorClerkUserId: 'user_owen',
        now: jobTime,
        expiresAt: '2026-09-12T10:00:00.000Z',
      })
      expect((await store.findDraft(importId))?.uploaderClerkUserId).toBe('user_owen')

      await store.markUploaded(importId, 'user_sasha', 1234, jobTime)
      const lease = await store.claimValidationJob('worker-one', jobTime, '2026-08-13T10:05:00.000Z')
      expect(lease).toMatchObject({ importId, attempts: 1, actorClerkUserId: 'user_sasha' })
      expect(await store.claimValidationJob('worker-two', jobTime, '2026-08-13T10:05:00.000Z')).toBeNull()
      await store.beginValidation(importId, lease!.actorClerkUserId, jobTime)
      const recoveredLease = await store.claimValidationJob(
        'worker-two', '2026-08-13T10:06:00.000Z', '2026-08-13T10:11:00.000Z',
      )
      expect(recoveredLease).toMatchObject({ id: lease!.id, attempts: 2, leaseOwner: 'worker-two' })

      await expect(store.completeValidation({
        jobId: lease!.id,
        workerId: 'worker-one',
        importId,
        actorClerkUserId: lease!.actorClerkUserId,
        now: '2026-08-13T10:06:30.000Z',
        files: [{
          path: 'symbol.svg', mediaType: 'image/svg+xml', size: 6,
          sha256: 'a'.repeat(64), objectKey: `imports/${importId}/extracted/${'b'.repeat(64)}.svg`, sanitized: false,
        }],
        results: [],
      })).rejects.toBeInstanceOf(ImportStateConflictError)
      expect(Number((await database.query('SELECT count(*) FROM library_import_files')).rows[0].count)).toBe(0)

      await store.completeValidation({
        jobId: lease!.id,
        workerId: 'worker-two',
        importId,
        actorClerkUserId: lease!.actorClerkUserId,
        now: '2026-08-13T10:06:30.000Z',
        files: [{
          path: 'symbol.svg', mediaType: 'image/svg+xml', size: 6,
          sha256: 'a'.repeat(64), objectKey: `imports/${importId}/extracted/${'b'.repeat(64)}.svg`, sanitized: false,
        }],
        results: [{ path: 'symbol.svg', code: 'image_malformed', severity: 'error', message: 'Invalid image.' }],
      })
      expect((await store.findDraft(importId))?.status).toBe('invalid')
      const events = await database.query(
        'SELECT actor_clerk_user_id, event_type FROM library_import_audit_events WHERE import_id = $1 ORDER BY id',
        [importId],
      )
      expect(events.rows).toEqual([
        { actor_clerk_user_id: 'user_owen', event_type: 'draft_created' },
        { actor_clerk_user_id: 'user_sasha', event_type: 'upload_completed' },
        { actor_clerk_user_id: 'user_sasha', event_type: 'validation_started' },
        { actor_clerk_user_id: 'user_sasha', event_type: 'validation_completed' },
      ])
      await store.queueValidation(importId, 'user_brian', '2026-08-13T10:07:00.000Z')
      expect(await store.claimValidationJob(
        'worker-three', '2026-08-13T10:07:00.000Z', '2026-08-13T10:12:00.000Z',
      )).toMatchObject({ importId, attempts: 1, actorClerkUserId: 'user_brian' })

      const expiringId = '33333333-3333-4333-8333-333333333333'
      await store.createDraft({
        id: expiringId, kind: 'new_library', repositoryId: null,
        uploadObjectKey: `imports/${expiringId}/source.zip`, actorClerkUserId: 'user_brian',
        now: '2026-07-01T00:00:00.000Z', expiresAt: '2026-07-31T00:00:00.000Z',
      })
      expect(await store.expireDrafts('user_maintenance', jobTime)).toEqual([expiringId])
      expect((await store.findDraft(expiringId))?.status).toBe('expired')
      expect(await store.expireDrafts('user_maintenance', jobTime)).toEqual([expiringId])
      await store.markQuarantineDeleted(expiringId, jobTime)
      expect(await store.expireDrafts('user_maintenance', jobTime)).toEqual([])

      const canceledId = '44444444-4444-4444-8444-444444444444'
      await store.createDraft({
        id: canceledId, kind: 'new_library', repositoryId: null,
        uploadObjectKey: `imports/${canceledId}/source.zip`, actorClerkUserId: 'user_owen',
        now: jobTime, expiresAt: '2026-09-12T10:00:00.000Z',
      })
      await store.cancelDraft(canceledId, 'user_sasha', jobTime)
      expect((await store.findDraft(canceledId))?.status).toBe('canceled')
      expect(await store.expireDrafts('user_maintenance', jobTime)).toEqual([canceledId])
      expect((await database.query(
        `SELECT actor_clerk_user_id FROM library_import_audit_events
         WHERE import_id = $1 AND event_type = 'draft_canceled'`, [canceledId],
      )).rows).toEqual([{ actor_clerk_user_id: 'user_sasha' }])
    } finally {
      if (store) await store.close()
      else if (database) await database.end()
      await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`)
      await admin.end()
    }
  })
})
