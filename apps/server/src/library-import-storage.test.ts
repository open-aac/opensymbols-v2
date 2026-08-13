import type { S3Client } from '@aws-sdk/client-s3'
import { createPresignedPost } from '@aws-sdk/s3-presigned-post'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { importObjectStorageFromEnvironment, S3ImportObjectStorage } from './library-import-storage.js'

vi.mock('@aws-sdk/s3-presigned-post', () => ({
  createPresignedPost: vi.fn(),
}))

const id = '11111111-1111-4111-8111-111111111111'

describe('S3ImportObjectStorage', () => {
  beforeEach(() => vi.mocked(createPresignedPost).mockReset())

  it('creates a short-lived encrypted POST constrained to one source key and size', async () => {
    vi.mocked(createPresignedPost).mockResolvedValue({
      url: 'https://bucket.example.test', fields: { policy: 'opaque' },
    })
    const storage = new S3ImportObjectStorage({
      bucket: 'private-imports', region: 'us-west-1', client: {} as S3Client,
      now: () => new Date('2026-08-13T10:00:00.000Z'),
    })
    const key = `imports/${id}/source.zip`
    const upload = await storage.createUpload(key, 200, 600)
    expect(upload).toMatchObject({ objectKey: key, maximumBytes: 200, expiresAt: '2026-08-13T10:10:00.000Z' })
    expect(vi.mocked(createPresignedPost).mock.calls[0]?.[1]).toMatchObject({
      Bucket: 'private-imports', Key: key, Expires: 600,
      Fields: { 'Content-Type': 'application/zip', 'x-amz-server-side-encryption': 'AES256' },
      Conditions: expect.arrayContaining([
        ['content-length-range', 1, 200],
        ['eq', '$key', key],
      ]),
    })
  })

  it('refuses reads, writes, uploads, and deletes outside an owned UUID prefix', async () => {
    const storage = new S3ImportObjectStorage({
      bucket: 'private-imports', region: 'us-west-1', client: {} as S3Client,
    })
    await expect(storage.createUpload('public/source.zip', 10, 10)).rejects.toThrow(/namespace/)
    await expect(storage.read(`imports/${id}/../secret`)).rejects.toThrow(/namespace/)
    await expect(storage.write(`imports/${id}/source.zip`, Buffer.from('x'), 'text/plain')).rejects.toThrow(/namespace/)
    await expect(storage.deletePrefix('imports/')).rejects.toThrow(/namespace/)
  })

  it('does not include environment values in configuration failures', () => {
    expect(importObjectStorageFromEnvironment({})).toBeUndefined()
    expect(() => importObjectStorageFromEnvironment({
      IMPORT_QUARANTINE_BUCKET: 'private-imports',
      IMPORT_QUARANTINE_REGION: '  ',
    })).toThrow('IMPORT_QUARANTINE_REGION must not be empty')
  })
})
