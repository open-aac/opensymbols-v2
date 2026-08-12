import { verifyToken } from '@clerk/backend'

export interface AppSession {
  userId: string
  administrator: boolean
}

export interface AppSessionVerifier {
  verify(request: Request): Promise<AppSession | null>
}

export interface ClerkSessionVerifierOptions {
  jwtKey: string
  authorizedParties: string[]
  verify?: typeof verifyToken
}

function bearerToken(request: Request) {
  const authorization = request.headers.get('authorization')
  const match = authorization?.match(/^Bearer\s+([^\s]+)$/i)
  return match?.[1]
}

export function parseAuthorizedParties(value: string | undefined) {
  return (value ?? '')
    .split(',')
    .map((party) => party.trim())
    .filter(Boolean)
}

export function createClerkSessionVerifier(
  options: ClerkSessionVerifierOptions,
): AppSessionVerifier {
  if (!options.jwtKey.trim()) throw new Error('CLERK_JWT_KEY must not be empty')
  if (options.authorizedParties.length === 0) {
    throw new Error('CLERK_AUTHORIZED_PARTIES must contain at least one origin')
  }

  const verify = options.verify ?? verifyToken

  return {
    async verify(request) {
      const token = bearerToken(request)
      if (!token) return null

      try {
        const payload = await verify(token, {
          jwtKey: options.jwtKey,
          authorizedParties: options.authorizedParties,
        })
        return typeof payload.sub === 'string' && payload.sub
          ? { userId: payload.sub, administrator: payload.administrator === true }
          : null
      } catch {
        return null
      }
    },
  }
}

export function clerkSessionVerifierFromEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
) {
  const jwtKey = environment.CLERK_JWT_KEY?.trim()
  if (!jwtKey) return undefined

  return createClerkSessionVerifier({
    jwtKey,
    authorizedParties: parseAuthorizedParties(environment.CLERK_AUTHORIZED_PARTIES),
  })
}
