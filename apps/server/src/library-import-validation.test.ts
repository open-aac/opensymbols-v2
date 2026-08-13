import { Readable } from 'node:stream'
import { ZipFile } from 'yazl'
import { describe, expect, it } from 'vitest'
import type { ImportObjectStorage, LibraryImportDraft } from './library-import-types.js'
import {
  ImportArchiveError,
  normalizeArchivePath,
  sanitizeSvg,
  validateLibraryArchive,
} from './library-import-validation.js'

const importId = '11111111-1111-4111-8111-111111111111'

class MemoryStorage implements ImportObjectStorage {
  readonly objects = new Map<string, Buffer>()

  async createUpload(): Promise<never> { throw new Error('not used') }
  async head() { return null }
  async read(key: string) {
    const value = this.objects.get(key)
    if (!value) throw new Error('missing object')
    return Readable.from(value)
  }
  async write(key: string, body: Buffer) { this.objects.set(key, Buffer.from(body)) }
  async deletePrefix(prefix: string) {
    for (const key of this.objects.keys()) if (key.startsWith(prefix)) this.objects.delete(key)
  }
}

const draft: LibraryImportDraft = {
  id: importId,
  kind: 'new_library',
  repositoryId: null,
  status: 'uploaded',
  uploadObjectKey: `imports/${importId}/source.zip`,
  uploaderClerkUserId: 'user_admin',
  createdAt: '2026-08-13T10:00:00.000Z',
  updatedAt: '2026-08-13T10:00:00.000Z',
  expiresAt: '2026-09-12T10:00:00.000Z',
}

function zip(entries: Array<{ path: string; body: string | Buffer; compress?: boolean; mode?: number }>) {
  return new Promise<Buffer>((resolve, reject) => {
    const archive = new ZipFile()
    const chunks: Buffer[] = []
    archive.outputStream.on('data', (chunk: Buffer) => chunks.push(chunk))
    archive.outputStream.once('error', reject)
    archive.outputStream.once('end', () => resolve(Buffer.concat(chunks)))
    for (const entry of entries) archive.addBuffer(Buffer.from(entry.body), entry.path, {
      compress: entry.compress ?? false,
      mode: entry.mode,
    })
    archive.end()
  })
}

describe('library import archive validation', () => {
  it('normalizes Unicode paths and rejects ambiguous or unsafe paths', () => {
    expect(normalizeArchivePath('symbols/Cafe\u0301.svg')).toBe('symbols/Café.svg')
    for (const path of [
      '../symbol.svg', '/symbol.svg', 'C:/symbol.svg', 'folder\\symbol.svg', 'a//b.svg', `${'a'.repeat(1_025)}.svg`,
    ]) {
      expect(() => normalizeArchivePath(path)).toThrow(ImportArchiveError)
    }
  })

  it('removes active SVG content and external references', () => {
    const source = Buffer.from(`<?xml-stylesheet href="https://tracker.example/style.css"?>
    <svg xmlns="http://www.w3.org/2000/svg" onload="go()">
      <script>alert(1)</script><foreignObject><p>unsafe</p></foreignObject>
      <style>path { fill: url(https://tracker.example/a.svg) }</style>
      <image href="https://tracker.example/a.png"/><path id="safe" fill="url(https://tracker.example/a.svg)"/>
    </svg>`)
    const output = sanitizeSvg(source)
    const text = output.data.toString('utf8')
    expect(output.changed).toBe(true)
    expect(text).toContain('id="safe"')
    expect(text).not.toMatch(/script|foreignObject|style|onload|tracker\.example/)
  })

  it('rejects document types and malformed SVG', () => {
    expect(() => sanitizeSvg(Buffer.from('<!DOCTYPE svg><svg/>'))).toThrowError(/not allowed/)
    expect(() => sanitizeSvg(Buffer.from('<svg><path></svg>'))).toThrowError(/malformed/)
  })

  it('streams valid files into deterministic private object keys', async () => {
    const storage = new MemoryStorage()
    storage.objects.set(draft.uploadObjectKey, await zip([
      { path: 'symbols/hello.svg', body: '<svg xmlns="http://www.w3.org/2000/svg"><path fill="#fff"/></svg>' },
      { path: 'manifest-v1.json', body: '{"schema_version":1}' },
    ]))
    const output = await validateLibraryArchive(storage, draft)
    expect(output.entryCount).toBe(2)
    expect(output.files.map(({ path }) => path)).toEqual(['symbols/hello.svg', 'manifest-v1.json'])
    expect(output.results).toEqual([])
    expect(output.files[0]?.objectKey).toMatch(new RegExp(`^imports/${importId}/extracted/[a-f0-9]{64}\\.svg$`))
  })

  it('reports unsupported and active files without accepting them', async () => {
    const storage = new MemoryStorage()
    storage.objects.set(draft.uploadObjectKey, await zip([
      { path: 'notes.txt', body: 'not an image' },
      { path: 'bad.svg', body: '<svg><script/></svg>' },
    ]))
    const output = await validateLibraryArchive(storage, draft)
    expect(output.files).toHaveLength(1)
    expect(output.files[0]?.sanitized).toBe(true)
    expect(output.results.map(({ code }) => code)).toEqual([
      'file_type_unsupported', 'svg_content_removed',
    ])
  })

  it('rejects malformed raster data, nested archives, and compression bombs', async () => {
    const storage = new MemoryStorage()
    const fakePng = Buffer.alloc(45)
    Buffer.from('89504e470d0a1a0a', 'hex').copy(fakePng)
    fakePng.writeUInt32BE(13, 8)
    fakePng.write('IHDR', 12, 'ascii')
    fakePng.writeUInt32BE(1, 16)
    fakePng.writeUInt32BE(1, 20)
    storage.objects.set(draft.uploadObjectKey, await zip([
      { path: 'broken.png', body: fakePng },
      { path: 'nested.zip', body: Buffer.from('504b0304', 'hex') },
      { path: 'compressed.svg', body: `<svg>${' '.repeat(50_000)}</svg>`, compress: true },
    ]))
    const output = await validateLibraryArchive(storage, draft)
    expect(output.files).toHaveLength(0)
    expect(output.results.map(({ code }) => code)).toEqual([
      'image_malformed', 'nested_archive_forbidden', 'compression_ratio_exceeded', 'archive_no_images',
    ])
  })

  it('rejects symbolic links before extracting their content', async () => {
    const storage = new MemoryStorage()
    storage.objects.set(draft.uploadObjectKey, await zip([
      { path: 'linked.svg', body: '../outside.svg', mode: 0o120777 },
    ]))
    await expect(validateLibraryArchive(storage, draft)).rejects.toMatchObject({ code: 'archive_symlink' })
    expect([...storage.objects.keys()]).toEqual([draft.uploadObjectKey])
  })
})
