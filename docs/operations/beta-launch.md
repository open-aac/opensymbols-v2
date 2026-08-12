# OpenSymbols public beta launch

Verified 4 August 2026. This runbook implements issue #97 without connecting to
or changing the production Heroku application or `www.opensymbols.org` DNS.

## Fixed topology and budget

| Service | Organization | Region and plan | Monthly cost before tax |
| --- | --- | --- | ---: |
| Railway application | Existing `wholesome-healing` project | SFO, existing `opensymbols-preview` service | Existing Railway charge |
| Crunchy Bridge | Brian Whitmer's team | AWS US West 1, PostgreSQL 17, Hobby-1, 10 GB, no HA | $23.50 |
| Meilisearch Cloud | Brian's Team | Oregon, Resource L, 2 vCPU, 8 GB, 32 GB included disk | $128.83 |

The verified new-service subtotal is **$152.33/month before tax**, excluding
Railway, Clerk, excess Meilisearch disk/bandwidth, and future upgrades.

Target names are `opensymbols-beta` for PostgreSQL and
`opensymbols-beta-search` for Meilisearch. The public origin is
`https://beta.opensymbols.org`.

## Approval gates and ownership prerequisites

Do not create a billable resource until the person executing the step receives
action-time approval for the named plan and price. Do not add or change DNS,
create persistent credentials, or delete old resources without the equivalent
action-time approval.

Before provisioning:

- Sasha accepts the pending Crunchy Bridge invitation.
- Billing and technical email addresses are set on the Crunchy Bridge team.
- Owen enables MFA; enforce team MFA only after every active administrator is ready.
- Brian adds the missing billing address to Brian's Meilisearch team.
- Brian, Owen, and Sasha confirm recovery access appropriate to their roles.
- Record credential owners and key UIDs, but never their secret values.

## Source database baseline

The source is the persistent local PostgreSQL copy on port 5433, never the
production Heroku database. Its verified baseline is PostgreSQL 17.10 and
191,567,539 bytes:

| Table | Rows |
| --- | ---: |
| `ar_internal_metadata` | 1 |
| `external_sources` | 192 |
| `picture_symbols` | 121,652 |
| `repository_modifiers` | 178 |
| `schema_migrations` | 7 |
| `symbol_repositories` | 12 |
| `symbol_requests` | 0 |

Create a fresh custom-format dump from `opensymbols_heroku_copy` using a source
URL held only in the process environment. Store the dump under ignored local
operator storage, record its SHA-256 hash, and restore with `--no-owner`,
`--no-acl`, and `--exit-on-error` through Crunchy Bridge's direct connection.

After restore, run the repository's Rails migrations against the Crunchy
administrator URL. The container accepts a host-provided URL without printing
it:

```sh
docker compose run --rm -e RAILS_ENV=production -e DATABASE_URL legacy-server bundle exec rails db:migrate
```

Verify the seven baseline counts and confirm that `app_users` and `characters`
exist and are empty before beta testing. Decode representative GoSecure records
and exercise an existing API credential before switching the application.

Create three database credentials:

- administrator/restore: schema changes, restores, and emergency repair only;
- application: required DML on application tables and sequence usage, without role or schema administration;
- search exporter: read-only access to the public source tables.

Install only the application URL in Railway. Keep the administrator and exporter
URLs in approved operator secret storage. Confirm managed backups and take a
named logical baseline before opening beta writes.

## Search build and activation

Create a separate non-expiring runtime search key and indexing key in the new
Meilisearch project. The runtime key can search only stable `symbols` and
`repositories`. The indexing key is restricted to those stable names and their
candidate patterns, with the actions documented in the repository README. It
must not manage keys, dumps, snapshots, or unrelated indexes.

Using the Crunchy read-only exporter URL in ignored `.env.search-indexer`:

```sh
pnpm search:rebuild --snapshot-id beta-initial
pnpm search:index:verify --input .search-data/postgres-beta-initial
```

Expected initial output is approximately 43,718 public symbols, 303,800 locale
documents, and 10 public repositories. Preflight must remain below the 700,000
combined stable-and-candidate guardrail. Review manifest hashes and exclusions
before explicitly activating:

```sh
pnpm search:index:activate --input .search-data/postgres-beta-initial
```

The first activation bootstraps empty stable indexes. Later rebuilds preserve
the live settings and leave the previous generation under candidate names for
rollback. Never silently fall back to PostgreSQL search.

## Railway and Clerk cutover

`railway.toml` defines the reproducible build, start command, health check, and
restart policy. Install these variables through Railway's secret manager:

```text
DATABASE_URL
SECURE_ENCRYPTION_KEY
S3_BUCKET
S3_CDN
DISCOVERY_PROVIDER=meilisearch
MEILISEARCH_HOST
MEILISEARCH_SEARCH_API_KEY
MEILISEARCH_SYMBOL_INDEX=symbols
MEILISEARCH_REPOSITORY_INDEX=repositories
VITE_CLERK_PUBLISHABLE_KEY
CLERK_JWT_KEY
CLERK_AUTHORIZED_PARTIES=https://beta.opensymbols.org
CLERK_WEBHOOK_SIGNING_SECRET
```

The Railway service must not receive the Crunchy administrator/exporter URLs,
Meilisearch indexing key, Clerk secret key, or Google OAuth secret. Remember
that the Vite Clerk key is embedded at build time, so changing it requires a
new build rather than only a process restart.

Create a production Clerk instance for the existing OpenSymbols application.
Enable email verification codes only, keep passwords and social providers
disabled, restrict authorized parties to the beta origin, and register
`https://beta.opensymbols.org/api/webhooks/clerk` for only `user.deleted`.
Google sign-in remains in issue #70 and is not a beta-launch dependency.

Add the custom domain to Railway and copy its exact DNS target. Add each exact
record displayed by Railway and Clerk to the DNS ledger with its purpose,
owner, creation date, and removal condition. Do not guess record targets and do
not alter the existing `www` record. Wait for public propagation and provider
certificate validation before smoke testing the beta hostname.

## Verification and launch

Before opening beta access:

- verify database counts, migrations, roles, backups, decoded settings, and API credentials;
- verify stable search counts, locale distribution, safety and repository filters, typo handling, and protected-content exclusion;
- test health, home, search, repository pagination, symbol details, images, random discovery, API documentation, and 404 handling;
- test email-code sign-up/sign-in, refresh, sign-out, `/api/app/session`, characters, conflicts, deletion, requests, API credentials, and the Clerk deletion webhook;
- inspect browser requests and application logs for Rails traffic, broken images, errors, or secrets;
- verify `www.opensymbols.org` and production Heroku remain unchanged.

Run the public load gate against the beta hostname:

```sh
BETA_BASE_URL=https://beta.opensymbols.org pnpm beta:load
```

The default is 20 concurrent workers for 10 minutes with a 15-second request
timeout. It fails when the error rate is at least 1%, search p95 is at least
500 ms, or a safe/repository filter leak is observed. Also confirm Railway and
provider dashboards show no connection exhaustion, CPU-quota incident, or
service restart.

Once public writes begin, Crunchy Bridge is authoritative. Do not point the app
back to the stale Railway database. Use forward repair or a separately planned
reverse migration.

## Rollback and cleanup

Before public writes, rollback may restore the previous Railway variables and
candidate search indexes. After writes, application rollback may revert code
or search indexes, but the database remains Crunchy Bridge.

After the complete smoke test, request explicit confirmation before deleting
the temporary Railway PostgreSQL service, old OpenSymbols Meilisearch trial
project, old credentials, or obsolete Railway variables. Retain the local
snapshot, dump hash, export manifests, Crunchy backups, and the previous search
generation until the observation period is complete.

## References

- [Railway configuration as code](https://docs.railway.com/config-as-code/reference)
- [Crunchy Bridge backups](https://docs.crunchybridge.com/concepts/backups)
- [Crunchy Bridge roles](https://docs.crunchybridge.com/how-to/create-and-set-role-permissions)
- [Meilisearch API keys](https://www.meilisearch.com/docs/learn/security/master_api_keys)
- [Clerk production deployment](https://clerk.com/docs/guides/development/deployment/production)
- [Clerk webhooks](https://clerk.com/docs/guides/development/webhooks/overview)
