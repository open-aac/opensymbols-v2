import type { Readable } from 'node:stream'

export const importStatuses = [
  'awaiting_upload',
  'uploaded',
  'validating',
  'review_ready',
  'invalid',
  'publishing',
  'published_search_pending',
  'published',
  'publish_failed',
  'expired',
  'canceled',
] as const

export type LibraryImportStatus = typeof importStatuses[number]
export type LibraryImportKind = 'new_library' | 'existing_library'
export type ImportJobStatus = 'queued' | 'leased' | 'completed'
export type ImportValidationSeverity = 'error' | 'warning'

export interface LibraryImportDraft {
  id: string
  kind: LibraryImportKind
  repositoryId: number | null
  status: LibraryImportStatus
  uploadObjectKey: string
  uploaderClerkUserId: string
  createdAt: string
  updatedAt: string
  expiresAt: string
}

export interface ImportValidationResult {
  path: string | null
  code: string
  severity: ImportValidationSeverity
  message: string
  details?: Record<string, string | number | boolean | null>
}

export interface ValidatedImportFile {
  path: string
  mediaType: 'image/svg+xml' | 'image/png' | 'image/jpeg' | 'application/json'
  size: number
  sha256: string
  objectKey: string
  sanitized: boolean
}

export interface ImportJobLease {
  id: string
  importId: string
  attempts: number
  leaseOwner: string
  leaseExpiresAt: string
  actorClerkUserId: string
}

export interface PresignedUpload {
  url: string
  fields: Record<string, string>
  objectKey: string
  expiresAt: string
  maximumBytes: number
}

export interface StoredObjectMetadata {
  size: number
  contentType?: string
}

export interface ImportObjectStorage {
  createUpload(objectKey: string, maximumBytes: number, expiresInSeconds: number): Promise<PresignedUpload>
  head(objectKey: string): Promise<StoredObjectMetadata | null>
  read(objectKey: string): Promise<Readable>
  write(objectKey: string, body: Buffer, contentType: string): Promise<void>
  deletePrefix(prefix: string): Promise<void>
}

export interface ImportDraftStore {
  createDraft(input: {
    id: string
    kind: LibraryImportKind
    repositoryId: number | null
    uploadObjectKey: string
    actorClerkUserId: string
    now: string
    expiresAt: string
  }): Promise<LibraryImportDraft>
  findDraft(importId: string): Promise<LibraryImportDraft | null>
  markUploaded(importId: string, actorClerkUserId: string, size: number, now: string): Promise<void>
  claimValidationJob(workerId: string, now: string, leaseExpiresAt: string): Promise<ImportJobLease | null>
  beginValidation(importId: string, actorClerkUserId: string, now: string): Promise<void>
  completeValidation(input: {
    jobId: string
    workerId: string
    importId: string
    actorClerkUserId: string
    now: string
    files: ValidatedImportFile[]
    results: ImportValidationResult[]
  }): Promise<void>
  retryValidation(jobId: string, workerId: string, errorCode: string, now: string, availableAt: string): Promise<void>
  queueValidation(importId: string, actorClerkUserId: string, now: string): Promise<void>
  cancelDraft(importId: string, actorClerkUserId: string, now: string): Promise<void>
  expireDrafts(actorClerkUserId: string, now: string): Promise<string[]>
  markQuarantineDeleted(importId: string, now: string): Promise<void>
  close(): Promise<void>
}

const transitions: Record<LibraryImportStatus, readonly LibraryImportStatus[]> = {
  awaiting_upload: ['uploaded', 'expired', 'canceled'],
  uploaded: ['validating', 'expired', 'canceled'],
  validating: ['validating', 'review_ready', 'invalid', 'expired', 'canceled'],
  review_ready: ['publishing', 'expired', 'canceled'],
  invalid: ['validating', 'expired', 'canceled'],
  publishing: ['published_search_pending', 'published', 'publish_failed'],
  published_search_pending: ['published'],
  published: [],
  publish_failed: ['publishing'],
  expired: [],
  canceled: [],
}

export function canTransitionImport(from: LibraryImportStatus, to: LibraryImportStatus) {
  return transitions[from].includes(to)
}

export function assertImportTransition(from: LibraryImportStatus, to: LibraryImportStatus) {
  if (!canTransitionImport(from, to)) {
    throw new Error(`Invalid library import transition: ${from} -> ${to}`)
  }
}
