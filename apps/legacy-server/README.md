OpenSymbols legacy server
-------------------------

This directory contains the Rails backend imported from legacy commit
`4bee9531677c88d7d37187f00babe98fd658665e` for incremental migration behind
the Hono gateway. The legacy repository's standalone React/Node frontend and
generated Vite assets are intentionally not included here.

Treat this application as a compatibility service. New public pages belong in
`apps/site`, and migrated API routes belong in `apps/server`.
[![OpenAAC](https://www.openaac.org/images//OpenAAC-advocate-blue.svg)](https://www.openaac.org/advocates.html)

## Public React UI

The public repository browser, symbol search, detail pages, and API explorer live in
`frontend/` and use React, TypeScript, and Vite. Rails still owns the JSON API,
database, authentication, uploads, and legacy creative tools.

With Node.js 22 installed, run `npm ci`. Start Rails on port 3001 and Vite in a
second terminal:

```sh
bin/rails server -p 3001
npm run dev
```

Production must run `npm ci && npm run build` before Rails starts so that
`public/vite/.vite/manifest.json` and its versioned assets exist.

Frontend checks are `npm run typecheck`, `npm run lint`, `npm test`, and
`npm run test:e2e`.

OpenSymbols is a ruby (Rails) server that makes it easy to collect
and search
through multiple image repositories. It's built around the idea of
aggregating open-licensed picture symbols for AAC. It can search
local and remote repositories.

You can see the site live at https://www.opensymbols.org

## Setup

All local repositories need to be in the same S3 bucket and in a
subfolder `/libraries`. They will also need a `manifest.json` file
that includes basic repository information. All the files in each
repository including manifest.json should be publicly available.

Once you have your repositories set up you can add them to your
site by executing the following command from the console on your
server or local computer:

```ruby
SymbolRepository.retrieve_from_manifest('<repository_folder>')
```

You'll need to set the environment variable, `S3_BUCKET=<yourbucketname>`
before the app will run. You can use the dotenv gem to easily set this
in development environments by editing the `.env` file (this option can work
in production too, but it's not set that way by default).

You can check out a couple different `manifest.json` files in the
`/examples` folder of the project.

## License

Licensed under the MIT License.
