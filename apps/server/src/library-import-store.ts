import { randomUUID } from 'node:crypto'
import { Pool, type PoolClient, type QueryResultRow } from 'pg'
import { canTransitionImport, type ImportDraftStore, type LibraryImportDraft, type LibraryImportStatus } from './library-import-types.js'

interface ImportRow extends QueryResultRow {
  id: string
  kind: LibraryImportDraft['kind']
  repository_id: number | string | null
  status: LibraryImportDraft['status']
  upload_object_key: string
  uploader_clerk_user_id: string
  created_at: Date | string
  updated_at: Date | string
  expires_at: Date | string
  upload_size: number | string | null
  repository_key: string | null
  repository_name: string | null
  default_license: string | null
  license_url: string | null
  attribution_name: string | null
}

interface JobRow extends QueryResultRow {
  id: string
  import_id: string
  attempts: number
  lease_owner: string
  lease_expires_at: Date | string
  actor_clerk_user_id: string
}

export class ImportStateConflictError extends Error {}

function assertStoreTransition(from: LibraryImportStatus, to: LibraryImportStatus) {
  if (!canTransitionImport(from, to)) {
    throw new ImportStateConflictError(`Invalid library import transition: ${from} -> ${to}`)
  }
}

function iso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function draft(row: ImportRow): LibraryImportDraft {
  return {
    id: row.id,
    kind: row.kind,
    repositoryId: row.repository_id === null ? null : Number(row.repository_id),
    status: row.status,
    uploadObjectKey: row.upload_object_key,
    uploaderClerkUserId: row.uploader_clerk_user_id,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    expiresAt: iso(row.expires_at),
    repositoryKey: row.repository_key,
    repositoryName: row.repository_name,
    defaultLicense: row.default_license,
    licenseUrl: row.license_url,
    attributionName: row.attribution_name,
  }
}

async function transaction<Result>(pool: Pool, work: (client: PoolClient) => Promise<Result>) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const value = await work(client)
    await client.query('COMMIT')
    return value
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

async function lockedImport(client: PoolClient, importId: string) {
  const query = await client.query<ImportRow>('SELECT * FROM library_imports WHERE id = $1 FOR UPDATE', [importId])
  const row = query.rows[0]
  if (!row) throw new ImportStateConflictError('Library import does not exist')
  return row
}

async function audit(
  client: PoolClient,
  importId: string,
  actorClerkUserId: string,
  eventType: string,
  now: string,
  details: Record<string, unknown> = {},
) {
  await client.query(
    `INSERT INTO library_import_audit_events
      (import_id, actor_clerk_user_id, event_type, details, created_at)
     VALUES ($1, $2, $3, $4::jsonb, $5)`,
    [importId, actorClerkUserId, eventType, JSON.stringify(details), now],
  )
}

export class PostgresImportDraftStore implements ImportDraftStore {
  constructor(private readonly pool: Pool) {}

  async createDraft(input: Parameters<ImportDraftStore['createDraft']>[0]) {
    return transaction(this.pool, async (client) => {
      const inserted = await client.query<ImportRow>(
        `INSERT INTO library_imports
          (id, kind, repository_id, status, upload_object_key, uploader_clerk_user_id,
           created_at, updated_at, expires_at, repository_key, repository_name,
           default_license, license_url, attribution_name)
         VALUES ($1, $2, $3, 'awaiting_upload', $4, $5, $6, $6, $7, $8, $9, $10, $11, $12)
         RETURNING *`,
        [input.id, input.kind, input.repositoryId, input.uploadObjectKey,
          input.actorClerkUserId, input.now, input.expiresAt,
          input.metadata?.repositoryKey ?? null, input.metadata?.repositoryName ?? null,
          input.metadata?.defaultLicense ?? null, input.metadata?.licenseUrl ?? null,
          input.metadata?.attributionName ?? null],
      )
      await audit(client, input.id, input.actorClerkUserId, 'draft_created', input.now, { kind: input.kind })
      return draft(inserted.rows[0]!)
    })
  }

  async findDraft(importId: string) {
    const query = await this.pool.query<ImportRow>('SELECT * FROM library_imports WHERE id = $1', [importId])
    return query.rows[0] ? draft(query.rows[0]) : null
  }

  async listDrafts() {
    const query = await this.pool.query<ImportRow>(
      `SELECT * FROM library_imports ORDER BY updated_at DESC, id DESC`,
    )
    return query.rows.map(draft)
  }

  async findDraftDetail(importId: string) {
    const importQuery = await this.pool.query<ImportRow>('SELECT * FROM library_imports WHERE id = $1', [importId])
    const row = importQuery.rows[0]
    if (!row) return null
    const [files, findings, auditEvents] = await Promise.all([
      this.pool.query<{
        normalized_path: string; media_type: 'image/svg+xml' | 'image/png' | 'image/jpeg' | 'application/json'
        byte_size: number | string; sha256: string; sanitized: boolean
      } & QueryResultRow>(
        `SELECT normalized_path, media_type, byte_size, sha256, sanitized
         FROM library_import_files WHERE import_id = $1 ORDER BY normalized_path`, [importId],
      ),
      this.pool.query<{
        normalized_path: string | null; code: string; severity: 'error' | 'warning'; message: string
        details: Record<string, string | number | boolean | null>
      } & QueryResultRow>(
        `SELECT normalized_path, code, severity, message, details
         FROM library_import_validation_results WHERE import_id = $1 ORDER BY id`, [importId],
      ),
      this.pool.query<{ actor_clerk_user_id: string; event_type: string; created_at: Date | string } & QueryResultRow>(
        `SELECT actor_clerk_user_id, event_type, created_at
         FROM library_import_audit_events WHERE import_id = $1 ORDER BY id`, [importId],
      ),
    ])
    return {
      ...draft(row),
      uploadSize: row.upload_size === null ? null : Number(row.upload_size),
      files: files.rows.map((file) => ({
        path: file.normalized_path,
        mediaType: file.media_type,
        size: Number(file.byte_size),
        sha256: file.sha256,
        sanitized: file.sanitized,
      })),
      results: findings.rows.map((finding) => ({
        path: finding.normalized_path,
        code: finding.code,
        severity: finding.severity,
        message: finding.message,
        details: finding.details,
      })),
      auditEvents: auditEvents.rows.map((event) => ({
        actorClerkUserId: event.actor_clerk_user_id,
        eventType: event.event_type,
        createdAt: iso(event.created_at),
      })),
    }
  }

  async publicRepositoryExists(repositoryId: number) {
    const query = await this.pool.query(
      `SELECT 1 FROM catalog_repositories WHERE id = $1 AND active = true AND protected = false`,
      [repositoryId],
    )
    return query.rowCount === 1
  }

  async listPublicRepositories() {
    const query = await this.pool.query<{ id: number | string; repository_key: string; name: string }>(
      `SELECT id, repository_key, name
       FROM catalog_repositories
       WHERE active = true AND protected = false
       ORDER BY lower(name), id`,
    )
    return query.rows.map((row) => ({ id: Number(row.id), key: row.repository_key, name: row.name }))
  }

  async markUploaded(importId: string, actorClerkUserId: string, size: number, now: string) {
    await transaction(this.pool, async (client) => {
      const current = await lockedImport(client, importId)
      assertStoreTransition(current.status, 'uploaded')
      await client.query(
        `UPDATE library_imports
         SET status = 'uploaded', upload_size = $2, uploaded_at = $3, updated_at = $3
         WHERE id = $1`,
        [importId, size, now],
      )
      await client.query(
        `INSERT INTO library_import_jobs
          (id, import_id, job_type, actor_clerk_user_id, status, attempts,
           available_at, created_at, updated_at)
         VALUES ($1, $2, 'validate', $3, 'queued', 0, $4, $4, $4)
         ON CONFLICT (import_id, job_type) DO UPDATE
         SET actor_clerk_user_id = EXCLUDED.actor_clerk_user_id,
             status = 'queued', available_at = EXCLUDED.available_at,
             lease_owner = NULL, lease_expires_at = NULL, last_error_code = NULL,
             updated_at = EXCLUDED.updated_at`,
        [randomUUID(), importId, actorClerkUserId, now],
      )
      await audit(client, importId, actorClerkUserId, 'upload_completed', now, { size })
    })
  }

  async claimValidationJob(workerId: string, now: string, leaseExpiresAt: string) {
    return transaction(this.pool, async (client) => {
      const claimed = await client.query<JobRow>(
        `WITH candidate AS (
           SELECT jobs.id FROM library_import_jobs jobs
           JOIN library_imports imports ON imports.id = jobs.import_id
           WHERE jobs.job_type = 'validate'
             AND imports.expires_at > $2
             AND imports.status IN ('uploaded', 'validating', 'invalid')
             AND ((jobs.status = 'queued' AND jobs.available_at <= $2)
               OR (jobs.status = 'leased' AND lease_expires_at <= $2))
           ORDER BY jobs.available_at, jobs.created_at
           FOR UPDATE SKIP LOCKED LIMIT 1
         )
         UPDATE library_import_jobs jobs
         SET status = 'leased', attempts = attempts + 1, lease_owner = $1,
             lease_expires_at = $3, updated_at = $2
         FROM candidate
         WHERE jobs.id = candidate.id
         RETURNING jobs.id, jobs.import_id, jobs.attempts, jobs.lease_owner,
                   jobs.lease_expires_at, jobs.actor_clerk_user_id`,
        [workerId, now, leaseExpiresAt],
      )
      const row = claimed.rows[0]
      return row ? {
        id: row.id,
        importId: row.import_id,
        attempts: row.attempts,
        leaseOwner: row.lease_owner,
        leaseExpiresAt: iso(row.lease_expires_at),
        actorClerkUserId: row.actor_clerk_user_id,
      } : null
    })
  }

  async renewValidationLease(jobId: string, workerId: string, now: string, leaseExpiresAt: string) {
    const renewed = await this.pool.query(
      `UPDATE library_import_jobs jobs
       SET lease_expires_at = $4, updated_at = $3
       FROM library_imports imports
       WHERE jobs.id = $1 AND jobs.lease_owner = $2 AND jobs.status = 'leased'
         AND jobs.import_id = imports.id
         AND imports.status = 'validating' AND imports.expires_at > $3
       RETURNING jobs.id`,
      [jobId, workerId, now, leaseExpiresAt],
    )
    if (renewed.rowCount !== 1) throw new ImportStateConflictError('Validation job lease is no longer active')
  }

  async beginValidation(importId: string, actorClerkUserId: string, now: string) {
    await transaction(this.pool, async (client) => {
      const current = await lockedImport(client, importId)
      if (!['uploaded', 'validating', 'invalid'].includes(current.status)) {
        throw new ImportStateConflictError(`Cannot validate import in ${current.status}`)
      }
      if (current.status !== 'validating') assertStoreTransition(current.status, 'validating')
      await client.query('DELETE FROM library_import_validation_results WHERE import_id = $1', [importId])
      await client.query('DELETE FROM library_import_files WHERE import_id = $1', [importId])
      await client.query(
        `UPDATE library_imports
         SET status = 'validating', validation_started_at = $2,
             validation_completed_at = NULL, updated_at = $2
         WHERE id = $1`,
        [importId, now],
      )
      await audit(client, importId, actorClerkUserId, 'validation_started', now)
    })
  }

  async completeValidation(input: Parameters<ImportDraftStore['completeValidation']>[0]) {
    await transaction(this.pool, async (client) => {
      const current = await lockedImport(client, input.importId)
      const status = input.results.some(({ severity }) => severity === 'error') ? 'invalid' : 'review_ready'
      assertStoreTransition(current.status, status)
      for (const file of input.files) {
        await client.query(
          `INSERT INTO library_import_files
            (import_id, normalized_path, media_type, byte_size, sha256,
             quarantine_object_key, sanitized, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [input.importId, file.path, file.mediaType, file.size, file.sha256,
            file.objectKey, file.sanitized, input.now],
        )
      }
      for (const validation of input.results) {
        await client.query(
          `INSERT INTO library_import_validation_results
            (import_id, normalized_path, code, severity, message, details, created_at)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
          [input.importId, validation.path, validation.code, validation.severity,
            validation.message, JSON.stringify(validation.details ?? {}), input.now],
        )
      }
      const completed = await client.query(
        `UPDATE library_import_jobs
         SET status = 'completed', lease_owner = NULL, lease_expires_at = NULL,
             last_error_code = NULL, updated_at = $2
         WHERE id = $1 AND import_id = $3 AND status = 'leased' AND lease_owner = $4
           AND lease_expires_at > $2
         RETURNING id`,
        [input.jobId, input.now, input.importId, input.workerId],
      )
      if (completed.rowCount !== 1) throw new ImportStateConflictError('Validation job lease is no longer active')
      await client.query(
        `UPDATE library_imports
         SET status = $2, validation_completed_at = $3, updated_at = $3
         WHERE id = $1`,
        [input.importId, status, input.now],
      )
      await audit(client, input.importId, input.actorClerkUserId, 'validation_completed', input.now, {
        status,
        fileCount: input.files.length,
        errorCount: input.results.filter(({ severity }) => severity === 'error').length,
        warningCount: input.results.filter(({ severity }) => severity === 'warning').length,
      })
    })
  }

  async retryValidation(jobId: string, workerId: string, errorCode: string, now: string, availableAt: string) {
    await transaction(this.pool, async (client) => {
      const updated = await client.query<{ import_id: string; actor_clerk_user_id: string } & QueryResultRow>(
        `UPDATE library_import_jobs
         SET status = 'queued', available_at = $2, lease_owner = NULL,
             lease_expires_at = NULL, last_error_code = $3, updated_at = $1
         WHERE id = $4 AND status = 'leased' AND lease_owner = $5 AND lease_expires_at > $1
         RETURNING import_id, actor_clerk_user_id`,
        [now, availableAt, errorCode, jobId, workerId],
      )
      const row = updated.rows[0]
      if (!row) throw new ImportStateConflictError('Validation job lease is no longer active')
      await audit(client, row.import_id, row.actor_clerk_user_id, 'validation_retry_scheduled', now, { errorCode })
    })
  }

  async queueValidation(importId: string, actorClerkUserId: string, now: string) {
    await transaction(this.pool, async (client) => {
      const current = await lockedImport(client, importId)
      if (current.status !== 'invalid') {
        throw new ImportStateConflictError(`Cannot retry validation in ${current.status}`)
      }
      const queued = await client.query(
        `UPDATE library_import_jobs
         SET actor_clerk_user_id = $2, status = 'queued', attempts = 0,
             available_at = $3, lease_owner = NULL, lease_expires_at = NULL,
             last_error_code = NULL, updated_at = $3
         WHERE import_id = $1 AND job_type = 'validate'`,
        [importId, actorClerkUserId, now],
      )
      if (queued.rowCount !== 1) throw new ImportStateConflictError('Validation job does not exist')
      await audit(client, importId, actorClerkUserId, 'validation_requested', now)
    })
  }

  async cancelDraft(importId: string, actorClerkUserId: string, now: string) {
    await transaction(this.pool, async (client) => {
      const current = await lockedImport(client, importId)
      assertStoreTransition(current.status, 'canceled')
      await client.query(
        `UPDATE library_imports SET status = 'canceled', updated_at = $2 WHERE id = $1`,
        [importId, now],
      )
      await client.query(
        `UPDATE library_import_jobs
         SET status = 'completed', lease_owner = NULL, lease_expires_at = NULL, updated_at = $2
         WHERE import_id = $1 AND status <> 'completed'`,
        [importId, now],
      )
      await audit(client, importId, actorClerkUserId, 'draft_canceled', now)
    })
  }

  async expireDrafts(actorClerkUserId: string, now: string) {
    return transaction(this.pool, async (client) => {
      const expired = await client.query<{ id: string } & QueryResultRow>(
        `SELECT id FROM library_imports
         WHERE expires_at <= $1
           AND status IN ('awaiting_upload', 'uploaded', 'validating', 'review_ready', 'invalid')
           AND NOT EXISTS (
             SELECT 1 FROM library_import_jobs
             WHERE import_id = library_imports.id AND status = 'leased' AND lease_expires_at > $1
           )
         ORDER BY id FOR UPDATE`,
        [now],
      )
      for (const { id } of expired.rows) {
        await client.query(
          `UPDATE library_imports SET status = 'expired', updated_at = $2 WHERE id = $1`,
          [id, now],
        )
        await client.query(
          `UPDATE library_import_jobs
           SET status = 'completed', lease_owner = NULL, lease_expires_at = NULL, updated_at = $2
           WHERE import_id = $1 AND status <> 'completed'`,
          [id, now],
        )
        await audit(client, id, actorClerkUserId, 'draft_expired', now)
      }
      const cleanup = await client.query<{ id: string } & QueryResultRow>(
        `SELECT id FROM library_imports
         WHERE status IN ('expired', 'canceled') AND quarantine_deleted_at IS NULL
         ORDER BY id`,
      )
      return cleanup.rows.map(({ id }) => id)
    })
  }

  async markQuarantineDeleted(importId: string, now: string) {
    const updated = await this.pool.query(
      `UPDATE library_imports SET quarantine_deleted_at = $2, updated_at = $2
       WHERE id = $1 AND status IN ('expired', 'canceled') AND quarantine_deleted_at IS NULL`,
      [importId, now],
    )
    if (updated.rowCount !== 1) throw new ImportStateConflictError('Import is not awaiting quarantine cleanup')
  }

  close() {
    return this.pool.end()
  }
}

export function createPostgresImportDraftStore(connectionString: string) {
  return new PostgresImportDraftStore(new Pool({ connectionString }))
}
