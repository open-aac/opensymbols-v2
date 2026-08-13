import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'
import { decode as decodeJpeg } from 'jpeg-js'
import { PNG } from 'pngjs'
import * as yauzl from 'yauzl'
import type {
  ImportObjectStorage,
  ImportValidationResult,
  LibraryImportDraft,
  ValidatedImportFile,
} from './library-import-types.js'

export const importLimits = {
  archiveBytes: 200 * 1024 * 1024,
  entryCount: 5_000,
  expandedBytes: 1024 * 1024 * 1024,
  imageBytes: 25 * 1024 * 1024,
  manifestBytes: 5 * 1024 * 1024,
  compressionRatio: 100,
  pathBytes: 1_024,
  rasterDimension: 16_384,
  rasterPixels: 25_000_000,
} as const

export class ImportArchiveError extends Error {
  constructor(readonly code: string, message: string) {
    super(message)
  }
}

function result(
  code: string,
  message: string,
  path: string | null = null,
  severity: ImportValidationResult['severity'] = 'error',
): ImportValidationResult {
  return { path, code, severity, message }
}

export function normalizeArchivePath(rawPath: string) {
  if (!rawPath || rawPath.includes('\\')) {
    throw new ImportArchiveError('archive_path_invalid', 'Archive paths must use unambiguous POSIX separators.')
  }
  if (rawPath.startsWith('/') || /^[A-Za-z]:/.test(rawPath)) {
    throw new ImportArchiveError('archive_path_absolute', 'Absolute archive paths are not allowed.')
  }
  if (/\p{Cc}/u.test(rawPath)) {
    throw new ImportArchiveError('archive_path_control_character', 'Archive paths may not contain control characters.')
  }
  const normalized = rawPath.normalize('NFC')
  if (Buffer.byteLength(normalized, 'utf8') > importLimits.pathBytes) {
    throw new ImportArchiveError('archive_path_too_long', 'Archive paths may not exceed 1,024 UTF-8 bytes.')
  }
  const segments = normalized.split('/')
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new ImportArchiveError('archive_path_traversal', 'Archive paths may not contain empty, dot, or parent segments.')
  }
  return normalized
}

function sha256(value: Buffer | string) {
  return createHash('sha256').update(value).digest('hex')
}

function entryLimit(path: string) {
  return path === 'manifest-v1.json' ? importLimits.manifestBytes : importLimits.imageBytes
}

function readEntryBuffer(zip: yauzl.ZipFile, entry: yauzl.Entry, limit: number) {
  return new Promise<Buffer>((resolve, reject) => {
    zip.openReadStream(entry, (error, stream) => {
      if (error || !stream) return reject(error ?? new Error('ZIP entry stream unavailable'))
      const chunks: Buffer[] = []
      let size = 0
      stream.on('data', (chunk: Buffer) => {
        size += chunk.length
        if (size > limit) {
          stream.destroy(new ImportArchiveError('file_too_large', `File exceeds the ${limit}-byte limit.`))
          return
        }
        chunks.push(chunk)
      })
      stream.once('error', () => reject(new ImportArchiveError('archive_invalid', 'ZIP entry data is invalid.')))
      stream.once('end', () => resolve(Buffer.concat(chunks, size)))
    })
  })
}

function pngDimensions(data: Buffer) {
  const signature = Buffer.from('89504e470d0a1a0a', 'hex')
  if (data.length < 24 || !data.subarray(0, 8).equals(signature) || data.toString('ascii', 12, 16) !== 'IHDR') {
    throw new ImportArchiveError('image_malformed', 'PNG signature or IHDR data is invalid.')
  }
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) }
}

function jpegDimensions(data: Buffer) {
  if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8) {
    throw new ImportArchiveError('image_malformed', 'JPEG start marker is invalid.')
  }
  let offset = 2
  while (offset + 4 <= data.length) {
    while (data[offset] === 0xff) offset += 1
    const marker = data[offset++]
    if (marker === undefined || marker === 0xd9 || marker === 0xda) break
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue
    if (offset + 2 > data.length) break
    const length = data.readUInt16BE(offset)
    if (length < 2 || offset + length > data.length) break
    const isStartOfFrame = [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]
      .includes(marker)
    if (isStartOfFrame && length >= 7) {
      return { width: data.readUInt16BE(offset + 5), height: data.readUInt16BE(offset + 3) }
    }
    offset += length
  }
  throw new ImportArchiveError('image_malformed', 'JPEG dimensions could not be read.')
}

function assertRasterDimensions(dimensions: { width: number; height: number }) {
  const { width, height } = dimensions
  if (width < 1 || height < 1 || width > importLimits.rasterDimension || height > importLimits.rasterDimension
    || width * height > importLimits.rasterPixels) {
    throw new ImportArchiveError('image_dimensions_exceeded', 'Raster dimensions exceed the safe processing limit.')
  }
}

const forbiddenSvgElements = new Set([
  'script', 'foreignobject', 'iframe', 'object', 'embed', 'audio', 'video', 'canvas',
  'animate', 'animatemotion', 'animatetransform', 'set', 'discard', 'handler', 'style', 'link',
])

export function sanitizeSvg(data: Buffer) {
  const source = data.toString('utf8')
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) {
    throw new ImportArchiveError('svg_doctype_forbidden', 'SVG document types and entities are not allowed.')
  }
  const parseErrors: string[] = []
  let document: ReturnType<DOMParser['parseFromString']>
  try {
    document = new DOMParser({
      onError: (level, message) => {
        if (level === 'error' || level === 'fatalError') parseErrors.push(message)
      },
    }).parseFromString(source, 'image/svg+xml')
  } catch {
    throw new ImportArchiveError('svg_malformed', 'SVG markup is malformed or has no SVG root.')
  }
  const root = document.documentElement
  if (!root || parseErrors.length > 0 || (root.localName ?? '').toLowerCase() !== 'svg') {
    throw new ImportArchiveError('svg_malformed', 'SVG markup is malformed or has no SVG root.')
  }

  let changed = false
  for (let index = document.childNodes.length - 1; index >= 0; index -= 1) {
    const child = document.childNodes.item(index)
    if (child && (child.nodeType === 7 || child.nodeType === 10)) {
      document.removeChild(child)
      changed = true
    }
  }
  type XmlElement = NonNullable<typeof root>
  const pending: XmlElement[] = [root]
  let visitedElements = 0
  while (pending.length > 0) {
    const element = pending.pop()!
    visitedElements += 1
    if (visitedElements > 100_000) {
      throw new ImportArchiveError('svg_complexity_exceeded', 'SVG contains too many elements to process safely.')
    }
    for (let index = element.childNodes.length - 1; index >= 0; index -= 1) {
      const child = element.childNodes.item(index)
      if (!child) continue
      if (child.nodeType === 1) {
        const childElement = child as XmlElement
        if (forbiddenSvgElements.has((childElement.localName ?? '').toLowerCase())) {
          element.removeChild(childElement)
          changed = true
        } else {
          pending.push(childElement)
        }
      } else if (child.nodeType === 7 || child.nodeType === 10) {
        element.removeChild(child)
        changed = true
      }
    }
    for (let index = element.attributes.length - 1; index >= 0; index -= 1) {
      const attribute = element.attributes.item(index)
      if (!attribute) continue
      const name = attribute.name.toLowerCase()
      const value = attribute.value.trim()
      const externalReference = (name === 'href' || name === 'xlink:href') && !value.startsWith('#')
      const activeStyle = /@import|expression\s*\(|url\s*\(\s*(?!['"]?#)/i.test(value)
      if (name.startsWith('on') || externalReference || activeStyle || /^javascript:/i.test(value)) {
        element.removeAttributeNode(attribute)
        changed = true
      }
    }
  }
  const sanitized = Buffer.from(new XMLSerializer().serializeToString(document), 'utf8')
  return { data: sanitized, changed }
}

function mediaFor(path: string, data: Buffer) {
  const extension = path.slice(path.lastIndexOf('.')).toLowerCase()
  if (extension === '.svg') {
    const sanitized = sanitizeSvg(data)
    return { mediaType: 'image/svg+xml' as const, ...sanitized }
  }
  if (extension === '.png') {
    assertRasterDimensions(pngDimensions(data))
    try {
      const decoded = PNG.sync.read(data, { checkCRC: true, skipRescale: true })
      assertRasterDimensions(decoded)
    } catch (error) {
      if (error instanceof ImportArchiveError) throw error
      throw new ImportArchiveError('image_malformed', 'PNG data could not be decoded safely.')
    }
    return { mediaType: 'image/png' as const, data, changed: false }
  }
  if (extension === '.jpg' || extension === '.jpeg') {
    assertRasterDimensions(jpegDimensions(data))
    try {
      const decoded = decodeJpeg(data, {
        useTArray: true,
        formatAsRGBA: false,
        tolerantDecoding: false,
        maxResolutionInMP: 25,
        maxMemoryUsageInMB: 128,
      })
      assertRasterDimensions(decoded)
    } catch (error) {
      if (error instanceof ImportArchiveError) throw error
      throw new ImportArchiveError('image_malformed', 'JPEG data could not be decoded safely.')
    }
    return { mediaType: 'image/jpeg' as const, data, changed: false }
  }
  if (path === 'manifest-v1.json') {
    try {
      const value: unknown = JSON.parse(data.toString('utf8'))
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('not an object')
    } catch {
      throw new ImportArchiveError('manifest_malformed', 'manifest-v1.json must contain a JSON object.')
    }
    return { mediaType: 'application/json' as const, data, changed: false }
  }
  if (extension === '.zip' || data.subarray(0, 4).equals(Buffer.from('504b0304', 'hex'))) {
    throw new ImportArchiveError('nested_archive_forbidden', 'Nested archives are not allowed.')
  }
  throw new ImportArchiveError('file_type_unsupported', 'Only SVG, PNG, JPEG, and manifest-v1.json are allowed.')
}

function isSymlink(entry: yauzl.Entry) {
  const unixMode = (entry.externalFileAttributes >>> 16) & 0o170000
  return unixMode === 0o120000
}

function openZip(path: string) {
  return new Promise<yauzl.ZipFile>((resolve, reject) => {
    yauzl.open(path, {
      lazyEntries: true,
      autoClose: true,
      decodeStrings: true,
      validateEntrySizes: true,
      strictFileNames: false,
    }, (error, zip) => error || !zip
      ? reject(new ImportArchiveError('archive_invalid', 'The uploaded file is not a valid ZIP archive.'))
      : resolve(zip))
  })
}

async function downloadArchive(storage: ImportObjectStorage, objectKey: string, path: string) {
  let bytes = 0
  const limiter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bytes += chunk.length
      callback(bytes > importLimits.archiveBytes
        ? new ImportArchiveError('archive_too_large', 'ZIP exceeds the 200 MB compressed limit.')
        : null, chunk)
    },
  })
  await pipeline(await storage.read(objectKey), limiter, createWriteStream(path, { flags: 'wx' }))
}

export interface ArchiveValidationOutput {
  files: ValidatedImportFile[]
  results: ImportValidationResult[]
  entryCount: number
  expandedBytes: number
}

export async function validateLibraryArchive(
  storage: ImportObjectStorage,
  draft: LibraryImportDraft,
): Promise<ArchiveValidationOutput> {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'opensymbols-import-'))
  const archivePath = join(temporaryDirectory, 'source.zip')
  try {
    await downloadArchive(storage, draft.uploadObjectKey, archivePath)
    const zip = await openZip(archivePath)
    if (zip.entryCount > importLimits.entryCount) {
      zip.close()
      throw new ImportArchiveError('archive_entry_limit', 'ZIP contains more than 5,000 entries.')
    }
    const files: ValidatedImportFile[] = []
    const results: ImportValidationResult[] = []
    const paths = new Set<string>()
    let entryCount = 0
    let expandedBytes = 0
    let imageCount = 0

    await new Promise<void>((resolve, reject) => {
      let settled = false
      const fail = (error: unknown) => {
        if (settled) return
        settled = true
        zip.close()
        reject(error)
      }
      zip.once('error', () => fail(new ImportArchiveError('archive_invalid', 'ZIP directory data is invalid.')))
      zip.once('end', () => {
        if (!settled) {
          settled = true
          resolve()
        }
      })
      zip.on('entry', (entry) => {
        void (async () => {
          entryCount += 1
          if (entryCount > importLimits.entryCount) {
            throw new ImportArchiveError('archive_entry_limit', 'ZIP contains more than 5,000 entries.')
          }
          if ((entry.generalPurposeBitFlag & 0x1) !== 0) {
            throw new ImportArchiveError('archive_encrypted', 'Encrypted ZIP entries are not allowed.')
          }
          if (isSymlink(entry)) throw new ImportArchiveError('archive_symlink', 'Symbolic links are not allowed.')
          if (entry.fileName.endsWith('/')) {
            const directoryPath = normalizeArchivePath(entry.fileName.slice(0, -1))
            if (paths.has(directoryPath)) {
              throw new ImportArchiveError('archive_duplicate_path', `Duplicate archive path: ${directoryPath}`)
            }
            paths.add(directoryPath)
            zip.readEntry()
            return
          }
          const path = normalizeArchivePath(entry.fileName)
          if (paths.has(path)) throw new ImportArchiveError('archive_duplicate_path', `Duplicate archive path: ${path}`)
          paths.add(path)
          expandedBytes += entry.uncompressedSize
          if (expandedBytes > importLimits.expandedBytes) {
            throw new ImportArchiveError('archive_expansion_limit', 'ZIP expands beyond the 1 GB limit.')
          }
          if (entry.uncompressedSize > entryLimit(path)) {
            results.push(result('file_too_large', 'File exceeds its size limit.', path))
            zip.readEntry()
            return
          }
          const ratio = entry.compressedSize === 0
            ? (entry.uncompressedSize === 0 ? 1 : Number.POSITIVE_INFINITY)
            : entry.uncompressedSize / entry.compressedSize
          if (ratio > importLimits.compressionRatio) {
            results.push(result('compression_ratio_exceeded', 'File exceeds the 100:1 compression-ratio limit.', path))
            zip.readEntry()
            return
          }
          const source = await readEntryBuffer(zip, entry, entryLimit(path))
          try {
            const media = mediaFor(path, source)
            const digest = sha256(media.data)
            const extension = path === 'manifest-v1.json' ? '.json' : path.slice(path.lastIndexOf('.')).toLowerCase()
            const objectKey = `imports/${draft.id}/extracted/${sha256(path)}${extension}`
            await storage.write(objectKey, media.data, media.mediaType)
            files.push({
              path,
              mediaType: media.mediaType,
              size: media.data.length,
              sha256: digest,
              objectKey,
              sanitized: media.changed,
            })
            if (media.mediaType.startsWith('image/')) imageCount += 1
            if (media.changed) {
              results.push(result('svg_content_removed', 'Unsafe or active SVG content was removed.', path, 'warning'))
            }
          } catch (error) {
            if (!(error instanceof ImportArchiveError)) throw error
            results.push(result(error.code, error.message, path))
          }
          zip.readEntry()
        })().catch(fail)
      })
      zip.readEntry()
    })

    if (imageCount === 0) results.push(result('archive_no_images', 'ZIP contains no valid symbol images.'))
    return { files, results, entryCount, expandedBytes }
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true })
  }
}

export function safeArchiveError(error: unknown) {
  if (error instanceof ImportArchiveError) return result(error.code, error.message)
  return result('archive_invalid', 'The archive could not be processed safely.')
}
