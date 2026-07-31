import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { POSTGRES_EXPORT_GENERATOR, type PostgresExportManifest } from './postgres-export.js'
import { cleanupBuild, loadBuild, preflightBuild } from './rebuild.js'

const roots: string[] = []
afterEach(async () => {
  vi.unstubAllGlobals()
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function build() {
  const directory = await mkdtemp(join(tmpdir(), 'opensymbols-rebuild-'))
  roots.push(directory)
  const repositoryBytes = 'repository fixture'
  const documentBytes = 'document fixture'
  await writeFile(join(directory, 'repositories.jsonl.gz'), repositoryBytes)
  await writeFile(join(directory, 'documents.jsonl.gz'), documentBytes)
  const stable: Omit<PostgresExportManifest, 'buildHash'> = {
    generator: POSTGRES_EXPORT_GENERATOR,
    schemaVersion: 1,
    snapshotId: 'b002',
    postgresVersion: '17',
    counts: { repositories: 1, symbols: 40, documents: 50 },
    excluded: { repositories: 2, disabledSymbols: 3, protectedSymbols: 4, hiddenRepositorySymbols: 5 },
    locales: { en: 40, es: 10 },
    symbolIds: { minimum: 1, maximum: 99 },
    files: {
      repositories: {
        name: 'repositories.jsonl.gz',
        sha256: createHash('sha256').update(repositoryBytes).digest('hex'),
      },
      documents: {
        name: 'documents.jsonl.gz',
        sha256: createHash('sha256').update(documentBytes).digest('hex'),
      },
    },
  }
  const manifest: PostgresExportManifest = {
    ...stable,
    buildHash: createHash('sha256').update(JSON.stringify(stable)).digest('hex'),
  }
  await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest))
  return loadBuild(directory)
}

describe('Meilisearch rebuild lifecycle', () => {
  it('derives stable candidate names from the build hash', async () => {
    const candidate = await build()
    expect(candidate.symbolCandidate).toBe(`symbols_candidate_${candidate.manifest.buildHash.slice(0, 12)}`)
    expect(candidate.repositoryCandidate).toBe(`repositories_candidate_${candidate.manifest.buildHash.slice(0, 12)}`)
  })

  it('rejects export data that no longer matches the manifest hash', async () => {
    const candidate = await build()
    await writeFile(join(candidate.directory, candidate.manifest.files.documents.name), 'tampered')
    await expect(loadBuild(candidate.directory)).rejects.toThrow('data hash')
  })

  it('refuses an upload that would exceed configured project capacity', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input) => {
      const url = String(input)
      if (url.endsWith('/indexes?limit=1000')) {
        return new Response(JSON.stringify({ results: [{ uid: 'symbols' }, { uid: 'repositories' }] }))
      }
      if (url.includes('_candidate_')) return new Response('missing', { status: 404 })
      if (url.includes('/indexes/symbols/stats')) {
        return new Response(JSON.stringify({ numberOfDocuments: 100, isIndexing: false }))
      }
      return new Response(JSON.stringify({ numberOfDocuments: 2, isIndexing: false }))
    }))
    await expect(preflightBuild({
      host: 'https://example.test', indexApiKey: 'secret', documentLimit: 150,
    }, await build())).rejects.toThrow('153 projected documents > 150')
  })

  it('requires the exact build hash before cleanup makes any request', async () => {
    const request = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', request)
    const candidate = await build()
    await expect(cleanupBuild({
      host: 'https://example.test', indexApiKey: 'secret', documentLimit: 1_000,
    }, candidate, 'wrong')).rejects.toThrow('confirmation')
    expect(request).not.toHaveBeenCalled()
  })
})
