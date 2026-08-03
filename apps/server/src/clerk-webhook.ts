import { verifyWebhook, type WebhookEvent } from '@clerk/backend/webhooks'

export interface ClerkWebhookVerifier {
  verify(request: Request): Promise<WebhookEvent>
}

export function createClerkWebhookVerifier(
  signingSecret: string,
  verify: typeof verifyWebhook = verifyWebhook,
): ClerkWebhookVerifier {
  if (!signingSecret.trim()) throw new Error('CLERK_WEBHOOK_SIGNING_SECRET must not be empty')
  return { verify: (request) => verify(request, { signingSecret }) }
}

export function clerkWebhookVerifierFromEnvironment(environment: NodeJS.ProcessEnv = process.env) {
  const signingSecret = environment.CLERK_WEBHOOK_SIGNING_SECRET?.trim()
  return signingSecret ? createClerkWebhookVerifier(signingSecret) : undefined
}
