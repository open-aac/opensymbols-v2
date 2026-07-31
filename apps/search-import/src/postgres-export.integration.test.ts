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

function secure(value: unknown) {
  return `**${JSON.stringify(value)}`
}

suite('PostgreSQL search export integration', () => {
  beforeAll(async () => {
    await admin.connect()
    await admin.query(`CREATE SCHEMA ${schema}`)
    await admin.query(`
      CREATE TABLE ${schema}.symbol_repositories (id integer PRIMARY KEY, repo_key text, settings text);
      CREATE TABLE ${schema}.repository_modifiers (id integer PRIMARY KEY, repo_key text, locale text, settings text);
      CREATE TABLE ${schema}.picture_symbols (
        id integer PRIMARY KEY, repo_key text, symbol_key text, enabled boolean,
        has_skin boolean, unsafe_result boolean, settings text
      )
    `)
    await admin.query(`INSERT INTO ${schema}.symbol_repositories VALUES
      (1, 'public', $1), (2, 'hidden', $2)`, [
      secure({ name: 'Public', active: true, protected: false }),
      secure({ name: 'Hidden', active: true, protected: true }),
    ])
    await admin.query(`INSERT INTO ${schema}.repository_modifiers VALUES (1, 'public', 'es', $1)`, [
      secure({ defaults: { saludo: 'hello' } }),
    ])
    await admin.query(`INSERT INTO ${schema}.picture_symbols VALUES
      (10, 'public', 'hello', NULL, true, true, $1),
      (50, 'public', 'disabled', false, false, false, $2),
      (70, 'public', 'protected', true, false, false, $3),
      (90, 'hidden', 'hidden', true, false, false, $4)`, [
      secure({ enabled: true, name: 'Hello', image_url: '/hello.svg', locales: {
        en: { name: 'Hello', search_string: 'hello greeting' },
        es: { name: 'Hola', search_string: 'hola saludo' },
      } }),
      secure({ enabled: false, name: 'Disabled' }),
      secure({ enabled: true, protected_symbol: true, name: 'Protected' }),
      secure({ enabled: true, name: 'Hidden' }),
    ])
  })

  afterAll(async () => {
    await admin.query(`DROP SCHEMA ${schema} CASCADE`)
    await admin.end()
    await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })))
  })

  it('streams a deterministic public-only export without changing PostgreSQL', async () => {
    const connectionString = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}options=-csearch_path%3D${schema}`
    const before = await admin.query(`SELECT count(*)::int AS count FROM ${schema}.picture_symbols`)
    const root = await mkdtemp(join(tmpdir(), 'opensymbols-postgres-export-'))
    roots.push(root)
    const first = join(root, 'first')
    const second = join(root, 'second')
    const options = {
      connectionString, encryptionKey: 'unused', s3Bucket: 'bucket',
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
    expect(documents[1]!.keywordBoosts).toContainEqual({ term: 'saludo', weight: 5 })
    expect(await readFile(join(first, 'documents.jsonl.gz'))).toEqual(await readFile(join(second, 'documents.jsonl.gz')))
    expect(firstResult.manifest.buildHash).toBe(secondResult.manifest.buildHash)
    const after = await admin.query(`SELECT count(*)::int AS count FROM ${schema}.picture_symbols`)
    expect(after.rows).toEqual(before.rows)
  })
})
