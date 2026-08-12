import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readJsonl } from './jsonl.js'
import { exportPostgresSearchData } from './postgres-export.js'
import type { SearchDocument } from './types.js'

const run = process.env.RUN_DATABASE_INTEGRATION === '1'
const suite = run ? describe : describe.skip
const baseUrl = process.env.DATABASE_URL ?? 'postgresql://opensymbols:opensymbols@127.0.0.1:5432/opensymbols_development'
const schema = `search_export_${process.pid}`
const admin = new Client({ connectionString: baseUrl })
const roots: string[] = []

suite('PostgreSQL search export integration', () => {
  beforeAll(async () => {
    await admin.connect()
    await admin.query(`CREATE SCHEMA ${schema}`)
    await admin.query(`
      CREATE TABLE ${schema}.catalog_repositories (
        id integer PRIMARY KEY, repo_key text, name text, description text, website_url text,
        active boolean, protected boolean, attribution_license text,
        attribution_license_url text, attribution_author_name text, attribution_author_url text
      );
      CREATE TABLE ${schema}.catalog_repository_defaults (
        repository_id integer, locale text, search_term text, symbol_key text
      );
      CREATE TABLE ${schema}.catalog_symbols (
        id integer PRIMARY KEY, repository_id integer, symbol_key text, name text, description text,
        row_enabled boolean, settings_enabled boolean, row_has_skin boolean,
        settings_has_skin boolean, row_unsafe boolean, settings_unsafe boolean,
        has_variants boolean, protected_symbol boolean, image_url text, file_extension text,
        license text, license_url text, author text, author_url text, source_url text,
        search_string text
      );
      CREATE TABLE ${schema}.catalog_symbol_localizations (
        symbol_id integer, locale text, name text, description text, search_string text, ordinal integer
      );
      CREATE TABLE ${schema}.catalog_symbol_search_signals (
        symbol_id integer, locale text, scope text, ordinal integer,
        term text, signal_type text, score double precision
      );
    `)
    await admin.query(`
      INSERT INTO ${schema}.catalog_repositories
        (id, repo_key, name, active, protected)
      VALUES (1, 'public', 'Public', true, false), (2, 'hidden', 'Hidden', true, true);
      INSERT INTO ${schema}.catalog_repository_defaults VALUES (1, 'es', 'saludo', 'hello');
      INSERT INTO ${schema}.catalog_symbols
        (id, repository_id, symbol_key, name, row_enabled, settings_enabled,
         row_has_skin, settings_has_skin, row_unsafe, settings_unsafe,
         has_variants, protected_symbol, image_url)
      VALUES
        (10, 1, 'hello', 'Hello', NULL, true, true, true, true, true, false, false, '/hello.svg'),
        (50, 1, 'disabled', 'Disabled', false, false, false, false, false, false, false, false, NULL),
        (70, 1, 'protected', 'Protected', true, true, false, false, false, false, false, true, NULL),
        (90, 2, 'hidden', 'Hidden', true, true, false, false, false, false, false, false, NULL);
      INSERT INTO ${schema}.catalog_symbol_localizations VALUES
        (10, 'en', 'Hello', NULL, 'hello greeting', 0),
        (10, 'es', 'Hola', NULL, 'hola saludo', 1);
      INSERT INTO ${schema}.catalog_symbol_search_signals VALUES
        (10, 'en', 'base', 0, 'base greeting', 'use_score', 3),
        (10, 'es', 'localization', 0, 'saludo', 'use_score', 5);
    `)
  })

  afterAll(async () => {
    await admin.query(`DROP SCHEMA ${schema} CASCADE`)
    await admin.end()
    await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })))
  })

  it('streams a deterministic public-only export without changing PostgreSQL', async () => {
    const connectionString = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}options=-csearch_path%3D${schema}`
    const before = await admin.query(`SELECT count(*)::int AS count FROM ${schema}.catalog_symbols`)
    const root = await mkdtemp(join(tmpdir(), 'opensymbols-postgres-export-'))
    roots.push(root)
    const first = join(root, 'first')
    const second = join(root, 'second')
    const options = {
      connectionString, s3Bucket: 'bucket',
      s3Cdn: 'https://cdn.example.test', snapshotId: 'test-snapshot', batchSize: 1,
    }
    const firstResult = await exportPostgresSearchData({ ...options, outputDirectory: first })
    const secondResult = await exportPostgresSearchData({ ...options, outputDirectory: second })
    const documents: SearchDocument[] = []
    for await (const document of readJsonl<SearchDocument>(join(first, 'documents.jsonl.gz'))) documents.push(document)

    expect(firstResult.manifest.counts).toEqual({ repositories: 1, symbols: 1, documents: 2 })
    expect(firstResult.manifest.excluded).toEqual({
      repositories: 1, disabledSymbols: 1, protectedSymbols: 1, hiddenRepositorySymbols: 1,
    })
    expect(documents.map((document) => document.id)).toEqual(['10_en', '10_es'])
    expect(documents[0]).toMatchObject({ safe: false, visible: true, protected: false })
    expect(documents[0]!.keywordBoosts).toEqual([])
    expect(documents[1]!.keywordBoosts).toContainEqual({ term: 'saludo', weight: 5 })
    expect(await readFile(join(first, 'documents.jsonl.gz'))).toEqual(await readFile(join(second, 'documents.jsonl.gz')))
    expect(firstResult.manifest.buildHash).toBe(secondResult.manifest.buildHash)
    const after = await admin.query(`SELECT count(*)::int AS count FROM ${schema}.catalog_symbols`)
    expect(after.rows).toEqual(before.rows)
  })
})
