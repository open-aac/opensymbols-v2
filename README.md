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

Development and test searches use the seeded PostgreSQL data when no
Elasticsearch URL is configured. The fallback preserves the existing symbol
search response and visibility rules, so the React search page works without
cloud services. Production continues to require Elasticsearch.

## Verify

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

`pnpm test` runs both the pnpm workspace tests and the Rails test suite against
a disposable test database. Useful legacy-service commands are
`pnpm legacy:up`, `pnpm legacy:seed`, `pnpm legacy:logs`, `pnpm test:legacy`, and
`pnpm legacy:down`.

## Workspace

- `apps/site` contains the React, Vite, and TypeScript site.
- `apps/server` contains the Hono, Node.js, and TypeScript API.
- `apps/legacy-server` contains the isolated Rails backend used for routes that
  have not yet moved to Hono.

Each application has its own package manifest and production build. The site produces static assets in `apps/site/dist`; the server produces Node.js modules in `apps/server/dist`.
