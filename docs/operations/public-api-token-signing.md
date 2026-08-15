# Public API token signing

Hono signs new public API access tokens with `PUBLIC_API_TOKEN_SIGNING_KEY`.
This key is independent of database serialization, Clerk, shared secrets, and
the dormant Rails application. Generate it with a cryptographically secure
secret generator and install it only through deployment secret storage.

## Legacy overlap

For a cutover, install the former token-signing value temporarily as
`PUBLIC_API_LEGACY_TOKEN_VERIFICATION_KEY`. Hono continues issuing every new
token with `PUBLIC_API_TOKEN_SIGNING_KEY`; the legacy value is verification-only.
Because access tokens have a 36-hour validity boundary, remove the legacy value
no later than 36 hours after new-key issuance begins. Removing it requires only
a configuration change and restart, not a code deployment.

Monitor invalid-token and expired-token response rates without logging tokens,
signatures, shared secrets, or key material. Do not extend the overlap to fix a
client that can exchange its existing shared secret for a new token.

## Rotation and recovery

For later rotations, install the current signing key as the temporary legacy
verification key, install a new signing key, deploy, and remove the legacy key
after at most 36 hours. If the signing key is exposed, replace it immediately;
do not configure the exposed key for overlap. Existing tokens will become
invalid, while approved clients can obtain replacements from their unchanged
shared secrets.

Catalog migration uses `LEGACY_GOSECURE_DECRYPTION_KEY` only when an inherited
snapshot contains encrypted settings. It is not read by the Hono runtime or
Meilisearch exporter and should be removed after migration verification.
