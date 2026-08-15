import { Readable } from 'node:stream'
import { ZipFile } from 'yazl'
import { describe, expect, it, vi } from 'vitest'
import { LibraryImportEngine, LibraryImportInputError, retryDelayMilliseconds } from './library-import-engine.js'
import type {
  ImportDraftStore,
  ImportJobLease,
  ImportObjectStorage,
  LibraryImportDraft,
} from './library-import-types.js'
import { canTransitionImport } from './library-import-types.js'

const id = '11111111-1111-4111-8111-111111111111'
const now = new Date('2026-08-13T10:00:00.000Z')

class FakeStore implements ImportDraftStore {
  draft: LibraryImportDraft | null = null
  lease: ImportJobLease | null = null
  completed: Parameters<ImportDraftStore['completeValidation']>[0] | null = null
  retry: unknown[] | null = null
  failComplete = false
  failRetry = false

  async createDraft(input: Parameters<ImportDraftStore['createDraft']>[0]) {
    this.draft = {
      id: input.id, kind: input.kind, repositoryId: input.repositoryId,
      status: 'awaiting_upload', uploadObjectKey: input.uploadObjectKey,
      uploaderClerkUserId: input.actorClerkUserId, createdAt: input.now,
      updatedAt: input.now, expiresAt: input.expiresAt,
    }
    return this.draft
  }
  async findDraft() { return this.draft }
  async listDrafts() { return this.draft ? [this.draft] : [] }
  async findDraftDetail() { return null }
  async listPublicRepositories() { return [] }
  async publicRepositoryExists() { return true }
  async markUploaded(_importId: string, _actor: string, _size: number, timestamp: string) {
    if (this.draft) this.draft = { ...this.draft, status: 'uploaded', updatedAt: timestamp }
  }
  async claimValidationJob() { const lease = this.lease; this.lease = null; return lease }
  async renewValidationLease() {
    if (this.failComplete) throw new Error('validation lease was fenced')
  }
  async beginValidation() { if (this.draft) this.draft = { ...this.draft, status: 'validating' } }
  async completeValidation(input: Parameters<ImportDraftStore['completeValidation']>[0]) {
    if (this.failComplete) throw new Error('validation lease was fenced')
    this.completed = input
    if (this.draft) this.draft = {
      ...this.draft,
      status: input.results.some(({ severity }) => severity === 'error') ? 'invalid' : 'review_ready',
    }
  }
  async retryValidation(...input: Parameters<ImportDraftStore['retryValidation']>) {
    if (this.failRetry) throw new Error('validation lease was fenced')
    this.retry = input
  }
  async queueValidation() {}
  async cancelDraft() { if (this.draft) this.draft = { ...this.draft, status: 'canceled' } }
  async expireDrafts() { return this.draft ? [this.draft.id] : [] }
  async markQuarantineDeleted() {}
  async close() {}
}

class FakeStorage implements ImportObjectStorage {
  metadata = { size: 100, contentType: 'application/zip' }
  deleted: string[] = []
  source: Buffer<ArrayBufferLike> = Buffer.from('not a zip')
  async createUpload(objectKey: string, maximumBytes: number, expiresInSeconds: number) {
    return {
      method: 'post' as const, url: 'https://uploads.example.test', fields: {}, objectKey, maximumBytes,
      expiresAt: new Date(now.getTime() + expiresInSeconds * 1000).toISOString(),
    }
  }
  async head() { return this.metadata }
  async read() { return Readable.from(this.source) }
  async write() {}
  async deletePrefix(prefix: string) { this.deleted.push(prefix) }
}

function validZip() {
  return new Promise<Buffer>((resolve, reject) => {
    const archive = new ZipFile()
    const chunks: Buffer[] = []
    archive.outputStream.on('data', (chunk: Buffer) => chunks.push(chunk))
    archive.outputStream.once('error', reject)
    archive.outputStream.once('end', () => resolve(Buffer.concat(chunks)))
    archive.addBuffer(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><path/></svg>'), 'symbol.svg', {
      compress: false,
    })
    archive.end()
  })
}

describe('LibraryImportEngine', () => {
  it('creates a 30-day draft with a constrained upload', async () => {
    const store = new FakeStore()
    const storage = new FakeStorage()
    const engine = new LibraryImportEngine(store, storage, { now: () => now, id: () => id })
    const created = await engine.createDraft('user_admin', 'new_library', null)
    expect(created.draft.expiresAt).toBe('2026-09-12T10:00:00.000Z')
    expect(created.upload.objectKey).toBe(`imports/${id}/source.zip`)
    expect(created.upload.maximumBytes).toBe(200 * 1024 * 1024)
  })

  it('does not persist a draft when upload authorization fails', async () => {
    const store = new FakeStore()
    const storage = new FakeStorage()
    vi.spyOn(storage, 'createUpload').mockRejectedValueOnce(new Error('object storage unavailable'))
    const engine = new LibraryImportEngine(store, storage, { now: () => now, id: () => id })

    await expect(engine.createDraft('user_admin', 'new_library', null)).rejects.toThrow(/unavailable/)
    expect(store.draft).toBeNull()
  })

  it('rejects mismatched repository identity and invalid uploaded objects', async () => {
    const store = new FakeStore()
    const storage = new FakeStorage()
    const engine = new LibraryImportEngine(store, storage, { now: () => now, id: () => id })
    await expect(engine.createDraft('user_admin', 'new_library', 4)).rejects.toBeInstanceOf(LibraryImportInputError)
    await engine.createDraft('user_admin', 'new_library', null)
    storage.metadata = { size: 0, contentType: 'application/zip' }
    await expect(engine.completeUpload(id, 'user_admin')).rejects.toThrow(/size/)
  })

  it('turns a malformed ZIP into a durable invalid result', async () => {
    const store = new FakeStore()
    const storage = new FakeStorage()
    const engine = new LibraryImportEngine(store, storage, { now: () => now, id: () => id })
    await engine.createDraft('user_admin', 'new_library', null)
    await engine.completeUpload(id, 'user_admin')
    store.lease = {
      id: '22222222-2222-4222-8222-222222222222', importId: id, attempts: 1,
      leaseOwner: 'worker-a', leaseExpiresAt: '2026-08-13T10:05:00.000Z', actorClerkUserId: 'user_admin',
    }
    const result = await engine.processNextValidation('worker-a')
    expect(result).toEqual({ importId: id, status: 'invalid' })
    expect(store.completed?.workerId).toBe('worker-a')
    expect(store.completed?.results[0]?.code).toBe('archive_invalid')
  })

  it('retries a malformed archive when extracted-object cleanup is unavailable', async () => {
    const store = new FakeStore()
    const storage = new FakeStorage()
    const engine = new LibraryImportEngine(store, storage, { now: () => now, id: () => id })
    await engine.createDraft('user_admin', 'new_library', null)
    await engine.completeUpload(id, 'user_admin')
    store.lease = {
      id: '22222222-2222-4222-8222-222222222222', importId: id, attempts: 1,
      leaseOwner: 'worker-a', leaseExpiresAt: '2026-08-13T10:05:00.000Z', actorClerkUserId: 'user_admin',
    }
    vi.spyOn(storage, 'deletePrefix')
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('cleanup unavailable'))

    await expect(engine.processNextValidation('worker-a')).rejects.toThrow(/cleanup unavailable/)
    expect(store.completed).toBeNull()
    expect(store.retry).toEqual([
      '22222222-2222-4222-8222-222222222222', 'worker-a', 'quarantine_cleanup_unavailable',
      '2026-08-13T10:00:00.000Z', '2026-08-13T10:00:05.000Z',
    ])
  })

  it('requeues infrastructure failures with bounded exponential delay', async () => {
    const store = new FakeStore()
    const storage = new FakeStorage()
    const engine = new LibraryImportEngine(store, storage, { now: () => now, id: () => id })
    await engine.createDraft('user_admin', 'new_library', null)
    await engine.completeUpload(id, 'user_admin')
    store.lease = {
      id: '22222222-2222-4222-8222-222222222222', importId: id, attempts: 3,
      leaseOwner: 'worker-a', leaseExpiresAt: '2026-08-13T10:05:00.000Z', actorClerkUserId: 'user_admin',
    }
    vi.spyOn(storage, 'deletePrefix').mockRejectedValueOnce(new Error('object storage unavailable'))
    await expect(engine.processNextValidation('worker-a')).rejects.toThrow(/unavailable/)
    expect(store.retry).toEqual([
      '22222222-2222-4222-8222-222222222222', 'worker-a', 'validation_unavailable',
      '2026-08-13T10:00:00.000Z', '2026-08-13T10:00:20.000Z',
    ])
    expect(retryDelayMilliseconds(20)).toBe(60 * 60 * 1_000)
  })

  it('removes extracted objects when expiry fences an active validator', async () => {
    const store = new FakeStore()
    const storage = new FakeStorage()
    storage.source = await validZip()
    const engine = new LibraryImportEngine(store, storage, { now: () => now, id: () => id })
    await engine.createDraft('user_admin', 'new_library', null)
    await engine.completeUpload(id, 'user_admin')
    store.lease = {
      id: '22222222-2222-4222-8222-222222222222', importId: id, attempts: 1,
      leaseOwner: 'worker-a', leaseExpiresAt: '2026-08-13T10:05:00.000Z', actorClerkUserId: 'user_admin',
    }
    store.failComplete = true
    store.failRetry = true

    await expect(engine.processNextValidation('worker-a')).rejects.toThrow(/fenced/)
    expect(storage.deleted).toEqual([
      `imports/${id}/extracted/`,
      `imports/${id}/extracted/`,
    ])
  })

  it('supports only the approved lifecycle transitions', () => {
    expect(canTransitionImport('awaiting_upload', 'uploaded')).toBe(true)
    expect(canTransitionImport('review_ready', 'publishing')).toBe(true)
    expect(canTransitionImport('published', 'validating')).toBe(false)
    expect(canTransitionImport('expired', 'uploaded')).toBe(false)
  })

  it('records cancellation before attempting private-object cleanup', async () => {
    const store = new FakeStore()
    const storage = new FakeStorage()
    const engine = new LibraryImportEngine(store, storage, { now: () => now, id: () => id })
    await engine.createDraft('user_admin', 'new_library', null)
    const result = await engine.cancelDraft(id, 'user_admin')
    expect(store.draft?.status).toBe('canceled')
    expect(storage.deleted).toEqual([`imports/${id}/`])
    expect(result).toEqual({ cleanupPending: false })
  })
})
