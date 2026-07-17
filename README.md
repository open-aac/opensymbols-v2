# OpenSymbols v2

OpenSymbols v2 is a pnpm workspace with an independently buildable web application and API server.

## Requirements

- Node.js 22.12 or newer
- pnpm 10.30.1

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
- Health endpoint: http://localhost:3000/api/health

During development, Vite proxies requests under `/api` to the Hono server.

## Verify

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Workspace

- `apps/site` contains the React, Vite, and TypeScript site.
- `apps/server` contains the Hono, Node.js, and TypeScript API.

Each application has its own package manifest and production build. The site produces static assets in `apps/site/dist`; the server produces Node.js modules in `apps/server/dist`.
