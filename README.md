# OpenSymbols v2

OpenSymbols v2 is a pnpm workspace with an independently buildable web application and API server.

## Requirements

- Node.js 22.12 or newer
- pnpm 10.30.1
- Docker Desktop with Docker Compose

## Install

```sh
pnpm install
```

## Develop

Start the site and server together:

```sh
pnpm dev
```

- Site: http://localhost:5173
- Server: http://localhost:3000
- Legacy Rails server: http://localhost:3001 (loopback only)
- PostgreSQL: 127.0.0.1:5432 (loopback only)
- Health endpoint: http://localhost:3000/api/health

`pnpm dev` builds and starts the disposable PostgreSQL and legacy Rails services
before starting the site and Hono watchers. During development, Vite proxies
requests under `/api` to Hono, and Hono forwards approved unmigrated routes to
Rails. Stop the containers when they are no longer needed:

```sh
pnpm legacy:down
```

Copy `.env.example` to `.env` only when you need to override the local defaults.
The checked-in values are for local development and must not be used in
production. Set both `LEGACY_SERVER_PORT` and the matching port in
`LEGACY_SERVER_URL` when port 3001 is unavailable.

The React site owns `/`, `/search`, `/api`, `/repositories/:repoKey`, and
`/symbols/:repoKey/:symbolKey`. The `/api` page documents token generation and
symbol search and shared-secret applications with interactive same-origin
examples; it never stores submitted secrets or application details. After
`pnpm build`, the Hono production server
serves the Vite output and supports direct navigation to those client routes.
Set `SITE_DIST_PATH` only when the site build is stored somewhere other than
`apps/site/dist`.

Hono derives its local read-only PostgreSQL connection from `POSTGRES_USER`,
`POSTGRES_PASSWORD`, `POSTGRES_DB`, and `POSTGRES_PORT`, or uses an explicit
`DATABASE_URL`. PostgreSQL is published only on the loopback interface. The
typed store understands the legacy GoSecure `settings` format. Hono owns
anonymous repository reads, symbol detail, random symbols, repository symbols,
public symbol search, symbol requests, shared-secret applications, access-token
generation, and authorized v2 search. Public API use no longer requires Rails.

Seed the local database with repeatable demo repositories, symbols, defaults,
requests, and an approved development API source:

```sh
pnpm legacy:seed
```

The seed is explicit and safe to rerun. It updates only records owned by the
demo seed and preserves other local data. Demo images are served by the site
from `http://localhost:5173/demo-symbols` by default; override
`DEMO_ASSET_BASE_URL` when the site uses another origin. The local external
source token is `local-development-shared-secret`. These values are for local
development only, and the seed refuses to run in production.

Public discovery searches run directly against decoded symbol records in
PostgreSQL. Hono preserves the React search contract without requiring
Elasticsearch or another search service.

## User accounts

OpenSymbols user accounts use Clerk when the optional Clerk environment values
are configured. Public browsing, search, repositories, symbols, and API
documentation continue to work without Clerk.

For local development, create a Clerk development application that allows
email verification codes, then copy `.env.example` to `.env` and set:

- `VITE_CLERK_PUBLISHABLE_KEY` to the Clerk publishable key.
- `CLERK_JWT_KEY` to Clerk's PEM-formatted JWT public key. This is server-only.
- `CLERK_AUTHORIZED_PARTIES` to the comma-separated browser origins allowed to
  send tokens, including the exact local origin you use.

In the Clerk dashboard, disable password and social sign-in methods for this
development application and leave email verification code as the only sign-in
and sign-up method. Add both local origins if you alternate between `localhost`
and `127.0.0.1`. Restart `pnpm dev` after changing `.env`.

The React site owns `/sign-in/*`, `/sign-up/*`, and `/account`. Hono verifies
short-lived Clerk bearer tokens at `/api/app/session`; it never accepts a Clerk
secret key. Clerk's browser SDK manages its own session and this application
does not copy Clerk tokens into local storage, session storage, URLs, or logs.

The obsolete Rails administrator sign-in, session bridge, and public admin
routes have been removed. Clerk-backed administrator authorization and tools
are tracked separately. No database user table, webhook, roles, saved
characters, symbol packs, or personalization is included yet.

## Verify

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

`pnpm test` runs the pnpm workspace tests, the Hono store integration test
against a disposable PostgreSQL database, and the Rails test suite. Useful
service commands are
`pnpm legacy:up`, `pnpm legacy:seed`, `pnpm legacy:logs`, `pnpm test:legacy`, and
`pnpm legacy:down`; `pnpm test:database` runs only the disposable Hono database
integration test.

## Workspace

- `apps/site` contains the React, Vite, and TypeScript site.
- `apps/server` contains the Hono, Node.js, and TypeScript API.
- `apps/legacy-server` contains the isolated Rails backend used for routes that
  have not yet moved to Hono.

Each application has its own package manifest and production build. The site produces static assets in `apps/site/dist`; the server produces Node.js modules in `apps/server/dist`.
