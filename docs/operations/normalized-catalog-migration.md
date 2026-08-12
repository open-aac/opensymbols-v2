# Normalized catalog migration

The catalog migrator creates a parallel, typed PostgreSQL model without changing
the legacy tables. Hono and the Meilisearch exporter use this normalized model
after verification. It is intended for a restored snapshot or an approved
migration environment. Do not point it at production Heroku.

## Safety model

- `audit` runs in a read-only transaction and writes nothing.
- `migrate` audits and copies from one repeatable-read transaction, so active
  legacy writers cannot change the source snapshot between those phases. It
  refuses unknown top-level or nested settings keys before creating rows.
- A SHA-256 source fingerprint covers every legacy row and typed column. The
  fingerprint is reported, but source settings and secrets are not.
- Embedded NUL characters are stripped by one named reconciliation rule. Each
  occurrence records the source table, numeric ID, field path, value hash,
  action, and result—never the value itself.
- When a malformed NUL-bearing object key collides with an existing clean key,
  the clean key wins. This preserves the value addressable by the legacy
  application and records `kept_existing_clean_key` for review.
- Obsolete symbol tracking and translation artifacts are isolated in the
  versioned `catalog_legacy_extensions` evidence table. Runtime code must not
  treat it as a settings bag.
- `verify` compares source counts and fingerprint, all recorded normalized
  table counts, base entity counts, and reconciliation totals.
- `rollback` deletes only rows owned by the named migration run. Foreign-key
  cascades remove its normalized children; legacy tables are untouched.

Schema creation is idempotent. Running `migrate` again for a completed snapshot
performs verification rather than inserting a second copy.

## Commands

Set `DATABASE_URL` and, only when the source contains encrypted GoSecure rows,
`SECURE_ENCRYPTION_KEY` in process environment. Do not pass either value as a
command-line option.

```sh
pnpm catalog:migrate:audit --snapshot-id b002
pnpm catalog:migrate:run --snapshot-id b002
pnpm catalog:migrate:verify --snapshot-id b002
pnpm catalog:migrate:rollback --snapshot-id b002
```

Snapshot IDs contain 1–80 letters, numbers, dots, underscores, or hyphens. Use
an immutable backup identifier rather than a date generated at runtime.

## Restored snapshot acceptance

The known Heroku copy has this baseline:

| Legacy table | Rows |
| --- | ---: |
| `picture_symbols` | 121,652 |
| `symbol_repositories` | 12 |
| `repository_modifiers` | 178 |
| `external_sources` | 192 |
| `symbol_requests` | 0 |

The audit reports `matchesRestoredSnapshotBaseline: true` only for that exact
set of base counts. A different source can still be migrated, but its snapshot
identity, counts, and fingerprint must be reviewed explicitly.

## Mapping boundaries

Repositories, attribution, visibility, symbols, flags, localizations, search
signals, variants, repository defaults, symbol requests/comments, and API
clients have typed columns or purpose-specific child tables. Original numeric
IDs, keys, timestamps, and shared secrets are retained. Locale and search-signal
ordinals preserve legacy object precedence where normalization would otherwise
merge colliding keys. After `verify` succeeds, Hono and the Meilisearch exporter
read the normalized tables; new requests and API clients are written there.
Legacy tables remain unchanged and there is no silent runtime fallback.
