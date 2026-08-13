import { randomUUID } from 'node:crypto'
import type {
  ImportDraftStore,
  ImportObjectStorage,
  LibraryImportDraft,
  LibraryImportKind,
  PresignedUpload,
} from './library-import-types.js'
import { ImportArchiveError, importLimits, safeArchiveError, validateLibraryArchive } from './library-import-validation.js'

const dayMilliseconds = 24 * 60 * 60 * 1_000
const uploadLifetimeSeconds = 10 * 60
const leaseMilliseconds = 5 * 60 * 1_000

export class LibraryImportInputError extends Error {}
export class LibraryImportNotFoundError extends Error {}

export interface CreatedLibraryImport {
  draft: LibraryImportDraft
  upload: PresignedUpload
}

export interface LibraryImportEngineOptions {
  now?: () => Date
  id?: () => string
}

export class LibraryImportEngine {
  private readonly now: () => Date
  private readonly id: () => string

  constructor(
    private readonly store: ImportDraftStore,
    private readonly storage: ImportObjectStorage,
    options: LibraryImportEngineOptions = {},
  ) {
    this.now = options.now ?? (() => new Date())
    this.id = options.id ?? randomUUID
  }

  async createDraft(
    actorClerkUserId: string,
    kind: LibraryImportKind,
    repositoryId: number | null,
  ): Promise<CreatedLibraryImport> {
    if (!actorClerkUserId) throw new LibraryImportInputError('A verified administrator actor is required.')
    if ((kind === 'new_library' && repositoryId !== null)
      || (kind === 'existing_library' && (!Number.isSafeInteger(repositoryId) || Number(repositoryId) < 1))) {
      throw new LibraryImportInputError('Repository identity does not match the import kind.')
    }
    const id = this.id()
    const now = this.now()
    const uploadObjectKey = `imports/${id}/source.zip`
    const draft = await this.store.createDraft({
      id,
      kind,
      repositoryId,
      uploadObjectKey,
      actorClerkUserId,
      now: now.toISOString(),
      expiresAt: new Date(now.getTime() + 30 * dayMilliseconds).toISOString(),
    })
    return { draft, upload: await this.uploadForDraft(draft) }
  }

  async createUpload(importId: string) {
    const draft = await this.requireDraft(importId)
    if (draft.status !== 'awaiting_upload') {
      throw new LibraryImportInputError(`Cannot upload an import in ${draft.status}.`)
    }
    return this.uploadForDraft(draft)
  }

  async completeUpload(importId: string, actorClerkUserId: string) {
    this.assertActor(actorClerkUserId)
    const draft = await this.requireDraft(importId)
    if (draft.status !== 'awaiting_upload') {
      throw new LibraryImportInputError(`Cannot complete an upload in ${draft.status}.`)
    }
    const metadata = await this.storage.head(draft.uploadObjectKey)
    if (!metadata) throw new LibraryImportInputError('The uploaded ZIP could not be found.')
    if (!Number.isSafeInteger(metadata.size) || metadata.size < 1 || metadata.size > importLimits.archiveBytes) {
      throw new LibraryImportInputError('The uploaded ZIP size is outside the allowed range.')
    }
    if (metadata.contentType && !['application/zip', 'application/x-zip-compressed'].includes(metadata.contentType)) {
      throw new LibraryImportInputError('The uploaded object is not identified as a ZIP archive.')
    }
    await this.store.markUploaded(importId, actorClerkUserId, metadata.size, this.now().toISOString())
  }

  async processNextValidation(workerId: string) {
    if (!workerId) throw new LibraryImportInputError('A worker identity is required.')
    const now = this.now()
    const lease = await this.store.claimValidationJob(
      workerId,
      now.toISOString(),
      new Date(now.getTime() + leaseMilliseconds).toISOString(),
    )
    if (!lease) return null

    const draft = await this.requireDraft(lease.importId)
    try {
      await this.store.beginValidation(draft.id, lease.actorClerkUserId, this.now().toISOString())
      await this.storage.deletePrefix(`imports/${draft.id}/extracted/`)
      const output = await validateLibraryArchive(this.storage, draft)
      await this.store.completeValidation({
        jobId: lease.id,
        workerId,
        importId: draft.id,
        actorClerkUserId: lease.actorClerkUserId,
        now: this.now().toISOString(),
        files: output.files,
        results: output.results,
      })
      return { importId: draft.id, status: output.results.some(({ severity }) => severity === 'error')
        ? 'invalid' as const : 'review_ready' as const }
    } catch (error) {
      if (error instanceof ImportArchiveError) {
        // Invalid archives can leave private extracted objects behind. Their
        // removal is best effort here and is guaranteed again at expiry.
        await this.storage.deletePrefix(`imports/${draft.id}/extracted/`).catch(() => undefined)
        await this.store.completeValidation({
          jobId: lease.id,
          workerId,
          importId: draft.id,
          actorClerkUserId: lease.actorClerkUserId,
          now: this.now().toISOString(),
          files: [],
          results: [safeArchiveError(error)],
        })
        return { importId: draft.id, status: 'invalid' as const }
      }
      const retryAt = new Date(this.now().getTime() + retryDelayMilliseconds(lease.attempts)).toISOString()
      await this.store.retryValidation(lease.id, workerId, 'validation_unavailable', this.now().toISOString(), retryAt)
      throw error
    }
  }

  async expireDrafts(actorClerkUserId: string) {
    this.assertActor(actorClerkUserId)
    const expired = await this.store.expireDrafts(actorClerkUserId, this.now().toISOString())
    const cleanupFailures: string[] = []
    for (const importId of expired) {
      try {
        await this.storage.deletePrefix(`imports/${importId}/`)
        await this.store.markQuarantineDeleted(importId, this.now().toISOString())
      } catch {
        cleanupFailures.push(importId)
      }
    }
    return { expired, cleanupFailures }
  }

  async cancelDraft(importId: string, actorClerkUserId: string) {
    this.assertActor(actorClerkUserId)
    await this.store.cancelDraft(importId, actorClerkUserId, this.now().toISOString())
    try {
      await this.storage.deletePrefix(`imports/${importId}/`)
      await this.store.markQuarantineDeleted(importId, this.now().toISOString())
      return { cleanupPending: false }
    } catch {
      return { cleanupPending: true }
    }
  }

  async retryDraftValidation(importId: string, actorClerkUserId: string) {
    this.assertActor(actorClerkUserId)
    await this.store.queueValidation(importId, actorClerkUserId, this.now().toISOString())
  }

  private async requireDraft(importId: string) {
    const draft = await this.store.findDraft(importId)
    if (!draft) throw new LibraryImportNotFoundError('Library import does not exist.')
    return draft
  }

  private uploadForDraft(draft: LibraryImportDraft) {
    return this.storage.createUpload(draft.uploadObjectKey, importLimits.archiveBytes, uploadLifetimeSeconds)
  }

  private assertActor(actorClerkUserId: string) {
    if (!actorClerkUserId) throw new LibraryImportInputError('A verified administrator actor is required.')
  }
}

export function retryDelayMilliseconds(attempts: number) {
  return Math.min(60 * 60 * 1_000, 5_000 * (2 ** Math.max(0, Math.min(attempts - 1, 10))))
}
