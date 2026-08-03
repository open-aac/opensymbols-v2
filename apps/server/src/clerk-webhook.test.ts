import type { verifyWebhook } from '@clerk/backend/webhooks'
import { describe, expect, it, vi } from 'vitest'
import { clerkWebhookVerifierFromEnvironment, createClerkWebhookVerifier } from './clerk-webhook.js'

describe('Clerk webhook verification', () => {
  it('uses the server-only signing secret with the Clerk verifier', async () => {
    const event = { type: 'user.deleted', data: { id: 'user_example' } }
    const verify = vi.fn(async () => event) as unknown as typeof verifyWebhook
    const verifier = createClerkWebhookVerifier('whsec_example', verify)
    const request = new Request('https://beta.opensymbols.org/api/webhooks/clerk', { method: 'POST' })

    await expect(verifier.verify(request)).resolves.toBe(event)
    expect(verify).toHaveBeenCalledWith(request, { signingSecret: 'whsec_example' })
  })

  it('is disabled when no secret is configured and rejects blank explicit secrets', () => {
    expect(clerkWebhookVerifierFromEnvironment({} as NodeJS.ProcessEnv)).toBeUndefined()
    expect(() => createClerkWebhookVerifier('   ')).toThrow('CLERK_WEBHOOK_SIGNING_SECRET')
  })
})
