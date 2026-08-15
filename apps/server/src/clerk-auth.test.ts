import { describe, expect, it, vi } from 'vitest'
import { TokenVerificationError, TokenVerificationErrorReason } from '@clerk/backend/errors'
import { createClerkSessionVerifier, parseAuthorizedParties } from './clerk-auth.js'

describe('Clerk session verification', () => {
  it('parses a comma-separated authorized-party allowlist', () => {
    expect(parseAuthorizedParties(' http://localhost:5173,https://symbols.example ')).toEqual([
      'http://localhost:5173',
      'https://symbols.example',
    ])
    expect(parseAuthorizedParties(undefined)).toEqual([])
  })

  it('verifies a bearer token with the configured key and parties', async () => {
    const verify = vi.fn().mockResolvedValue({ sub: 'user_example', administrator: true })
    const verifier = createClerkSessionVerifier({
      jwtKey: 'public-key',
      authorizedParties: ['http://localhost:5173'],
      verify,
    })

    await expect(verifier.verify(new Request('http://localhost/api/app/session', {
      headers: { Authorization: 'Bearer session-token' },
    }))).resolves.toEqual({ userId: 'user_example', administrator: true })
    expect(verify).toHaveBeenCalledWith('session-token', {
      jwtKey: 'public-key',
      authorizedParties: ['http://localhost:5173'],
    })
  })

  it.each([
    undefined,
    false,
    'true',
    1,
    { value: true },
  ])('treats a %j administrator claim as a non-administrator', async (administrator) => {
    const verifier = createClerkSessionVerifier({
      jwtKey: 'public-key',
      authorizedParties: ['http://localhost:5173'],
      verify: vi.fn().mockResolvedValue({ sub: 'user_example', administrator }),
    })

    await expect(verifier.verify(new Request('http://localhost/api/app/session', {
      headers: { Authorization: 'Bearer session-token' },
    }))).resolves.toEqual({ userId: 'user_example', administrator: false })
  })

  it('rejects missing, malformed, invalid, and subjectless tokens', async () => {
    const verify = vi.fn()
      .mockRejectedValueOnce(new TokenVerificationError({
        message: 'expired',
        reason: TokenVerificationErrorReason.TokenExpired,
      }))
      .mockResolvedValueOnce({})
    const verifier = createClerkSessionVerifier({
      jwtKey: 'public-key',
      authorizedParties: ['http://localhost:5173'],
      verify,
    })

    await expect(verifier.verify(new Request('http://localhost/api/app/session'))).resolves.toBeNull()
    await expect(verifier.verify(new Request('http://localhost/api/app/session', {
      headers: { Authorization: 'Basic credentials' },
    }))).resolves.toBeNull()
    await expect(verifier.verify(new Request('http://localhost/api/app/session', {
      headers: { Authorization: 'Bearer expired-token' },
    }))).resolves.toBeNull()
    await expect(verifier.verify(new Request('http://localhost/api/app/session', {
      headers: { Authorization: 'Bearer subjectless-token' },
    }))).resolves.toBeNull()
  })

  it('propagates operational verification failures to the application boundary', async () => {
    const unavailable = new TokenVerificationError({
      message: 'local verification key is unavailable',
      reason: TokenVerificationErrorReason.LocalJWKMissing,
    })
    const verifier = createClerkSessionVerifier({
      jwtKey: 'public-key',
      authorizedParties: ['http://localhost:5173'],
      verify: vi.fn().mockRejectedValue(unavailable),
    })

    await expect(verifier.verify(new Request('http://localhost/api/app/session', {
      headers: { Authorization: 'Bearer session-token' },
    }))).rejects.toBe(unavailable)
  })

  it('fails fast when configured incompletely', () => {
    expect(() => createClerkSessionVerifier({
      jwtKey: '',
      authorizedParties: ['http://localhost:5173'],
    })).toThrow('CLERK_JWT_KEY')
    expect(() => createClerkSessionVerifier({
      jwtKey: 'public-key',
      authorizedParties: [],
    })).toThrow('CLERK_AUTHORIZED_PARTIES')
  })
})
