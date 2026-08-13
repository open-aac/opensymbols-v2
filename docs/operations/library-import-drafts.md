# Draft library import operations

This is the private processing foundation for administrator library imports. It does not expose an HTTP API or publish catalog records. Those workflows are separate issues in the administrator import program.

## Storage boundary

Use a dedicated S3-compatible bucket for draft imports. It must:

- block every form of public access;
- require encryption at rest;
- allow the application to create a short-lived presigned POST only at `imports/<import UUID>/source.zip`;
- allow the validation worker to read that source, write only hash-named objects under `imports/<import UUID>/extracted/`, and delete only that import prefix;
- expire every object under `imports/` after 30 days; and
- avoid granting bucket-policy, lifecycle, website, ACL, or public-object administration to the application credentials.

The application cannot verify or change bucket-wide policy safely with its least-privilege credentials. Infrastructure owners must inspect the provider configuration before enabling uploads and record evidence that public access blocking and the 30-day lifecycle are active.

Configure the server through secret storage:

```text
IMPORT_QUARANTINE_BUCKET
IMPORT_QUARANTINE_REGION
IMPORT_QUARANTINE_ENDPOINT       # optional S3-compatible endpoint
IMPORT_QUARANTINE_FORCE_PATH_STYLE # optional, defaults to false
```

Provider credentials use the standard server-side AWS credential chain. They must never be sent to React, embedded in a presigned response, committed, or logged.

## Database and worker

Apply the draft schema after the normalized catalog schema exists:

```text
pnpm import:drafts:schema
```

Run one durable validation job:

```text
pnpm import:drafts:work
```

The worker claims one PostgreSQL job with `FOR UPDATE SKIP LOCKED`, a five-minute lease, and an owned worker identity. A crashed job becomes claimable after its lease expires. Operational failures are requeued with bounded exponential delay. Invalid archives complete as reviewable validation failures instead of retrying forever.

Run expiry from an authenticated administrator operation or an approved scheduled task whose actor value is recorded in the audit trail:

```text
pnpm import:drafts:expire --actor <audited-actor>
```

Expiry changes the database state first and then removes the private object prefix. A failed object cleanup is reported with a non-zero exit code and can be retried without reopening the expired draft.

## Validation limits

Validation streams the ZIP directory and processes one entry at a time. It enforces 200 MB compressed size, 5,000 files, 1 GB expanded size, 25 MB per image, 5 MB for `manifest-v1.json`, a 100:1 per-entry compression ratio, and bounded raster dimensions.

Archive paths are case-sensitive, NFC-normalized POSIX paths. Absolute paths, parent traversal, backslashes, empty segments, symlinks, encrypted entries, nested archives, duplicate paths, unsupported media, extension/content mismatches, malformed images, and active SVG content are rejected or reported. Sanitized draft files remain private and are never used as public catalog objects.

## Recovery

Draft state and audit events are authoritative in PostgreSQL. Do not infer state from object presence. Re-running a validation lease removes its previous private extracted prefix and replaces the prior file/results rows transactionally. Administrators share organizational draft visibility; API authorization and review UI arrive in the next child issue.
