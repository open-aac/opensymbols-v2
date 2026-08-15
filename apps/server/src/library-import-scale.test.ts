import { Readable } from 'node:stream'
import { ZipFile } from 'yazl'
import { describe, expect, it } from 'vitest'
import type { ImportObjectStorage, LibraryImportDraft } from './library-import-types.js'
import { validateLibraryArchive } from './library-import-validation.js'

const scale = process.env.RUN_IMPORT_SCALE === '1' ? describe : describe.skip

scale('library import 5,000-file scale validation', () => {
  it('processes the maximum entry count without retaining all file bodies', async () => {
    const archive = new ZipFile()
    const chunks: Buffer[] = []
    const archiveBuffer = new Promise<Buffer>((resolve, reject) => {
      archive.outputStream.on('data', (chunk: Buffer) => chunks.push(chunk))
      archive.outputStream.once('error', reject)
      archive.outputStream.once('end', () => resolve(Buffer.concat(chunks)))
    })
    for (let index = 0; index < 5_000; index += 1) {
      archive.addBuffer(
        Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg"><path id="p${index}"/></svg>`),
        `symbols/symbol-${index.toString().padStart(4, '0')}.svg`,
        { compress: false },
      )
    }
    archive.end()

    const source = await archiveBuffer
    let writes = 0
    let maximumWrite = 0
    const storage: ImportObjectStorage = {
      async createUpload() { throw new Error('not used') },
      async head() { return { size: source.length } },
      async read() { return Readable.from(source) },
      async write(_key, body) { writes += 1; maximumWrite = Math.max(maximumWrite, body.length) },
      async deletePrefix() {},
    }
    const id = '11111111-1111-4111-8111-111111111111'
    const draft: LibraryImportDraft = {
      id, kind: 'new_library', repositoryId: null, status: 'uploaded',
      uploadObjectKey: `imports/${id}/source.zip`, uploaderClerkUserId: 'user_admin',
      createdAt: '2026-08-13T10:00:00.000Z', updatedAt: '2026-08-13T10:00:00.000Z',
      expiresAt: '2026-09-12T10:00:00.000Z',
    }
    const output = await validateLibraryArchive(storage, draft)
    expect(output.entryCount).toBe(5_000)
    expect(output.files).toHaveLength(5_000)
    expect(writes).toBe(5_000)
    expect(maximumWrite).toBeLessThan(256)
  }, 60_000)
})
