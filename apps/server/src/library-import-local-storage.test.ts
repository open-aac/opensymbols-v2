import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LocalImportObjectStorage } from './library-import-local-storage.js'

const objectKey = 'imports/11111111-1111-4111-8111-111111111111/source.zip'
const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('LocalImportObjectStorage', () => {
  it('does not delete the winning file when a concurrent upload loses the exclusive create', async () => {
    const root = await mkdtemp(join(tmpdir(), 'opensymbols-import-'))
    roots.push(root)
    const storage = new LocalImportObjectStorage(root)
    const firstBody = new PassThrough()
    const firstUpload = storage.acceptUpload(objectKey, firstBody, 100)
    await vi.waitFor(async () => {
      await expect(storage.head(objectKey)).resolves.not.toBeNull()
    })

    await expect(storage.acceptUpload(objectKey, PassThrough.from('loser'), 100))
      .rejects.toMatchObject({ code: 'EEXIST' })

    firstBody.end('winning zip')
    await firstUpload
    await expect(storage.head(objectKey)).resolves.toMatchObject({ size: 11 })
  })
})
