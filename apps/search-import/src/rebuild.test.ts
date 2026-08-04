import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MeilisearchImportClient } from './meilisearch.js'
import { POSTGRES_EXPORT_GENERATOR, type PostgresExportManifest } from './postgres-export.js'
import { activateBuild, cleanupBuild, loadBuild, preflightBuild, rollbackBuild } from './rebuild.js'
import type { RepositoryDocument, SearchDocument } from './types.js'

const roots: string[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

const repository: RepositoryDocument = {
  id: 'core-aac', repoKey: 'core-aac', name: 'Core AAC', description: 'Core symbols',
  active: true, protected: false, license: 'CC0-1.0', licenseUrl: null,
  author: 'OpenSymbols', authorUrl: null, url: null, symbolCount: 40,
}

const documents: SearchDocument[] = Array.from({ length: 50 }, (_, index) => ({
  id: `${index + 1}_en`, symbolId: index + 1, symbolKey: `symbol-${index + 1}`,
  repoKey: 'core-aac', locale: 'en', safe: index !== 0, visible: true,
  name: `symbol ${index + 1}`, description: 'A symbol', englishName: `symbol ${index + 1}`,
  englishDescription: 'A symbol', searchTerms: ['symbol'], synonyms: [], keywordBoosts: [],
  text: `symbol ${index + 1}\nA symbol`, imageUrl: `https://assets.example.invalid/${index + 1}.svg`,
  enabled: true, protected: false, hasSkin: false, hasVariants: false, license: 'CC0-1.0',
  licenseUrl: null, author: 'OpenSymbols', authorUrl: null, sourceUrl: null, extension: 'svg',
}))

async function build() {
  const directory = await mkdtemp(join(tmpdir(), 'opensymbols-rebuild-'))
  roots.push(directory)
  const repositoryBytes = gzipSync(`${JSON.stringify(repository)}\n`)
  const documentBytes = gzipSync(documents.map((document) => JSON.stringify(document)).join('\n') + '\n')
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

  it('enforces the approved 700,000-document rebuild guardrail', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input) => {
      const url = String(input)
      if (url.endsWith('/indexes?limit=1000')) {
        return new Response(JSON.stringify({ results: [{ uid: 'symbols' }, { uid: 'repositories' }] }))
      }
      if (url.includes('_candidate_')) return new Response('missing', { status: 404 })
      if (url.includes('/indexes/symbols/stats')) {
        return new Response(JSON.stringify({ numberOfDocuments: 699_949, isIndexing: false }))
      }
      return new Response(JSON.stringify({ numberOfDocuments: 1, isIndexing: false }))
    }))
    await expect(preflightBuild({
      host: 'https://example.test', indexApiKey: 'secret', documentLimit: 700_000,
    }, await build())).rejects.toThrow('700001 projected documents > 700000')
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

  it('activates a clean project, rolls back atomically, and cleans up after confirmation', async () => {
    const candidate = await build()
    const stats = vi.spyOn(MeilisearchImportClient.prototype, 'stats').mockImplementation(async (index) => ({
      numberOfDocuments: index.includes('repositories') ? 1 : 50,
      isIndexing: false,
    }))
    vi.spyOn(MeilisearchImportClient.prototype, 'documents').mockImplementation(async (index, offset) => {
      if (index.includes('repositories')) return { results: [repository], total: 1 }
      return { results: offset === 0 ? documents : [], total: documents.length }
    })
    vi.spyOn(MeilisearchImportClient.prototype, 'searchIndex').mockResolvedValue({ hits: [documents[0]!] })
    const bootstrap = vi.spyOn(MeilisearchImportClient.prototype, 'bootstrapStableIndexes').mockResolvedValue({
      symbolIndexCreated: true,
      repositoryIndexCreated: true,
    })
    const swap = vi.spyOn(MeilisearchImportClient.prototype, 'swapIndexes').mockResolvedValue()
    const deleteIndex = vi.spyOn(MeilisearchImportClient.prototype, 'deleteIndex').mockResolvedValue()
    const config = { host: 'https://example.test', indexApiKey: 'secret', documentLimit: 700_000 }

    await expect(activateBuild(config, candidate)).resolves.toMatchObject({
      activated: candidate.manifest.buildHash,
      bootstrap: { symbolIndexCreated: true, repositoryIndexCreated: true },
    })
    expect(bootstrap).toHaveBeenCalledWith('symbols', 'repositories')
    expect(swap).toHaveBeenNthCalledWith(1, [
      ['symbols', candidate.symbolCandidate],
      ['repositories', candidate.repositoryCandidate],
    ])

    await expect(rollbackBuild(config, candidate)).resolves.toEqual({ rolledBack: candidate.manifest.buildHash })
    expect(swap).toHaveBeenCalledTimes(2)

    await expect(cleanupBuild(config, candidate, candidate.manifest.buildHash)).resolves.toEqual({
      cleaned: candidate.manifest.buildHash,
    })
    expect(deleteIndex).toHaveBeenCalledTimes(2)
    expect(stats).toHaveBeenCalled()
  })
})
