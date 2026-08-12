import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import type { ExternalSourceRecord, PublicApiStore } from './public-read-store.js'

const TOKEN_VALIDITY_SECONDS = 36 * 60 * 60
const DISPLAYED_EXPIRY_SECONDS = 24 * 60 * 60

export type PublicApiNonce = (label: 'external_source_token' | 'access_token') => string

export function securePublicApiNonce() {
  return randomBytes(18).toString('hex').slice(0, 24)
}

function sha512(value: string, salt: string, signingKey: string) {
  return createHash('sha512').update(`${value}${salt}${signingKey}`).digest('hex')
}

function throttleLevel(source: ExternalSourceRecord) {
  if (source.settings.full_access) return 5
  if (source.settings.approved) return 2
  return 1
}

function iso8601Seconds(date: Date) {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

export interface SharedSecretApplication {
  name: string
  email: string
  purpose: string
}

export function validateSharedSecretApplication(input: {
  org_name?: unknown
  org_email?: unknown
  org_purpose?: unknown
}): SharedSecretApplication | null {
  const name = typeof input.org_name === 'string' ? input.org_name.trim() : ''
  const email = typeof input.org_email === 'string' ? input.org_email.trim() : ''
  const purpose = typeof input.org_purpose === 'string' ? input.org_purpose.trim() : ''
  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !purpose) return null
  return { name, email, purpose }
}

export async function createSharedSecret(
  store: PublicApiStore,
  application: SharedSecretApplication,
  now: Date,
  nonce: PublicApiNonce,
) {
  const sharedSecret = nonce('external_source_token')
  await store.createExternalSource(sharedSecret, {
    name: application.name,
    email: application.email,
    purpose: application.purpose,
    approved: false,
  }, now.toISOString())
  return sharedSecret
}

export async function exchangeSharedSecret(
  store: PublicApiStore,
  sharedSecret: string,
  now: Date,
  nonce: PublicApiNonce,
  signingKey: string,
) {
  const source = await store.findExternalSourceByToken(sharedSecret)
  if (!source) return null
  const timestamp = Math.floor(now.getTime() / 1000)
  const userId = createHash('md5').update(String(timestamp)).digest('hex').slice(0, 10)
  const prefix = `token::${source.id}-${throttleLevel(source)}:${userId}:${timestamp}:${nonce('access_token')}:`
  return {
    access_token: `${prefix}${sha512(prefix, 'access_token_sha', signingKey)}`,
    expires: iso8601Seconds(new Date(now.getTime() + DISPLAYED_EXPIRY_SECONDS * 1000)),
  }
}

export type AccessTokenVerification =
  | { kind: 'valid' }
  | { kind: 'expired' }
  | { kind: 'invalid' }

function signaturesMatch(actual: string, expected: string) {
  const actualBytes = Buffer.from(actual)
  const expectedBytes = Buffer.from(expected)
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes)
}

export async function verifyAccessToken(
  store: PublicApiStore,
  rawToken: string,
  now: Date,
  signingKey: string,
  legacyVerificationKey?: string,
): Promise<AccessTokenVerification> {
  const token = rawToken.includes('::') ? rawToken : `token::${rawToken}`
  const match = token.match(/^token::(\d+)-(\d+):([^:]+):(\d+):([^:]+):([0-9a-f]{128})$/)
  if (!match) return { kind: 'invalid' }
  const [, sourceIdValue, levelValue, userId, timestampValue, nonce, signature] = match
  const sourceId = Number.parseInt(sourceIdValue!, 10)
  const level = Number.parseInt(levelValue!, 10)
  const timestamp = Number.parseInt(timestampValue!, 10)
  const source = await store.findExternalSourceById(sourceId)
  if (!source || throttleLevel(source) < level) return { kind: 'invalid' }
  const prefix = `token::${sourceId}-${level}:${userId}:${timestamp}:${nonce}:`
  const primaryMatches = signaturesMatch(signature!, sha512(prefix, 'access_token_sha', signingKey))
  const legacyMatches = legacyVerificationKey
    ? signaturesMatch(signature!, sha512(prefix, 'access_token_sha', legacyVerificationKey))
    : false
  if (!primaryMatches && !legacyMatches) {
    return { kind: 'invalid' }
  }
  const nowSeconds = Math.floor(now.getTime() / 1000)
  if (timestamp <= nowSeconds - TOKEN_VALIDITY_SECONDS) return { kind: 'expired' }
  return { kind: 'valid' }
}
