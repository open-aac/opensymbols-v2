import { createDecipheriv, createHash } from 'node:crypto'

export type JsonValue = boolean | number | string | null | JsonValue[] | { [key: string]: JsonValue }

export class GoSecureDecodeError extends Error {
  constructor() {
    super('Unable to decode secure settings')
    this.name = 'GoSecureDecodeError'
  }
}

function parse(value: string): JsonValue {
  try {
    return JSON.parse(value) as JsonValue
  } catch {
    throw new GoSecureDecodeError()
  }
}

export function decodeGoSecure(value: string, encryptionKey?: string): JsonValue {
  if (value.startsWith('**')) return parse(value.slice(2))
  if (/^\s*\{/.test(value)) return parse(value)
  if (!encryptionKey) throw new GoSecureDecodeError()
  const separator = value.indexOf('--')
  if (separator < 1) throw new GoSecureDecodeError()
  try {
    const key = createHash('sha256')
      .update(`secure_json_${encryptionKey}`)
      .digest('hex')
      .slice(0, 32)
    const iv = Buffer.from(value.slice(0, separator), 'base64').subarray(0, 16)
    const decipher = createDecipheriv('aes-256-cbc', Buffer.from(key, 'utf8'), iv)
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(value.slice(separator + 2), 'base64')),
      decipher.final(),
    ])
    return parse(decrypted.toString('utf8'))
  } catch (error) {
    if (error instanceof GoSecureDecodeError) throw error
    throw new GoSecureDecodeError()
  }
}

export function objectValue(value: JsonValue): Record<string, JsonValue> {
  if (!value || Array.isArray(value) || typeof value !== 'object') throw new GoSecureDecodeError()
  return value
}
