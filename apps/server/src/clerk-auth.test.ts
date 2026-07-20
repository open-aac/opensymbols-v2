import { describe, expect, it, vi } from 'vitest'
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
    const verify = vi.fn().mockResolvedValue({ sub: 'user_example' })
    const verifier = createClerkSessionVerifier({
      jwtKey: 'public-key',
      authorizedParties: ['http://localhost:5173'],
      verify,
    })

    await expect(verifier.verify(new Request('http://localhost/api/app/session', {
      headers: { Authorization: 'Bearer session-token' },
    }))).resolves.toEqual({ userId: 'user_example' })
    expect(verify).toHaveBeenCalledWith('session-token', {
      jwtKey: 'public-key',
      authorizedParties: ['http://localhost:5173'],
    })
  })

  it('rejects missing, malformed, invalid, and subjectless tokens', async () => {
    const verify = vi.fn()
      .mockRejectedValueOnce(new Error('expired'))
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
