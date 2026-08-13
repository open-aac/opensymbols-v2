import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { Transform, type Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ImportObjectStorage, PresignedUpload } from './library-import-types.js'

const uuidPattern = '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
const keyPattern = new RegExp(`^imports/${uuidPattern}/(?:source\\.zip|extracted/[0-9a-f]{64}\\.(?:svg|png|jpg|jpeg|json))$`)
const prefixPattern = new RegExp(`^imports/${uuidPattern}/(?:extracted/)?$`)

export class LocalImportObjectStorage implements ImportObjectStorage {
  private readonly root: string

  constructor(root: string, private readonly now: () => Date = () => new Date()) {
    this.root = resolve(root)
  }

  async createUpload(objectKey: string, maximumBytes: number, expiresInSeconds: number): Promise<PresignedUpload> {
    this.pathFor(objectKey)
    const importId = objectKey.split('/')[1]
    return {
      method: 'put',
      url: `/api/app/admin/imports/${importId}/content`,
      fields: {},
      objectKey,
      expiresAt: new Date(this.now().getTime() + expiresInSeconds * 1000).toISOString(),
      maximumBytes,
    }
  }

  async acceptUpload(objectKey: string, body: Readable, maximumBytes: number) {
    const path = this.pathFor(objectKey)
    await mkdir(dirname(path), { recursive: true })
    let bytes = 0
    const limiter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        bytes += chunk.length
        callback(bytes > maximumBytes ? new Error('Upload exceeds the maximum size') : null, chunk)
      },
    })
    try {
      await pipeline(body, limiter, createWriteStream(path, { flags: 'wx' }))
    } catch (error) {
      await rm(path, { force: true })
      throw error
    }
  }

  async head(objectKey: string) {
    try {
      const metadata = await stat(this.pathFor(objectKey))
      return { size: metadata.size, contentType: 'application/zip' }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    }
  }

  async read(objectKey: string) { return createReadStream(this.pathFor(objectKey)) }

  async write(objectKey: string, body: Buffer) {
    const path = this.pathFor(objectKey)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, body, { flag: 'wx' })
  }

  async deletePrefix(prefix: string) {
    if (!prefixPattern.test(prefix)) throw new Error('Delete prefix is outside the owned import namespace')
    await rm(join(this.root, ...prefix.split('/')), { recursive: true, force: true })
  }

  async countObjects() {
    try { return (await readdir(this.root, { recursive: true })).length } catch { return 0 }
  }

  private pathFor(key: string) {
    if (!keyPattern.test(key)) throw new Error('Object key is outside the owned import namespace')
    return join(this.root, ...key.split('/'))
  }
}
