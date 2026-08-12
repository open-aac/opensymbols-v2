import { createDecipheriv, createHash } from 'node:crypto'
import type { JsonValue } from './public-read-types.js'

const UNENCRYPTED_MARKER = '**'
const ENCRYPTED_SEPARATOR = '--'

export class GoSecureDecodeError extends Error {
  constructor() {
    super('Unable to decode secure settings')
    this.name = 'GoSecureDecodeError'
  }
}

function parseJson(value: string): JsonValue {
  try {
    return JSON.parse(value) as JsonValue
  } catch {
    throw new GoSecureDecodeError()
  }
}

function decryptSecureJson(value: string, encryptionKey: string | undefined) {
  if (!encryptionKey) throw new GoSecureDecodeError()

  const separatorIndex = value.indexOf(ENCRYPTED_SEPARATOR)
  if (separatorIndex < 1) throw new GoSecureDecodeError()

  try {
    const encodedIv = value.slice(0, separatorIndex)
    const encryptedJson = value.slice(separatorIndex + ENCRYPTED_SEPARATOR.length)
    const iv = Buffer.from(encodedIv, 'base64').subarray(0, 16)
    const decipher = createDecipheriv('aes-256-cbc', encryptionKeyBytes(encryptionKey), iv)
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedJson, 'base64')),
      decipher.final(),
    ])

    return decrypted.toString('utf8')
  } catch {
    throw new GoSecureDecodeError()
  }
}

function encryptionKeyBytes(encryptionKey: string) {
  const derivedKey = createHash('sha256')
    .update(`secure_json_${encryptionKey}`)
    .digest('hex')
    .slice(0, 32)
  return Buffer.from(derivedKey, 'utf8')
}

export function decodeGoSecure(value: string, encryptionKey?: string): JsonValue {
  if (value.startsWith(UNENCRYPTED_MARKER)) {
    return parseJson(value.slice(UNENCRYPTED_MARKER.length))
  }

  if (/^\s*\{/.test(value)) return parseJson(value)

  return parseJson(decryptSecureJson(value, encryptionKey))
}
