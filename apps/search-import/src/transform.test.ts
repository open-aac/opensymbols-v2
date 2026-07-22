import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { generateSearchData } from '../../server/src/search-data-generator.js'
import { inspectCutoff, transformDocuments, transformRepositories } from './transform.js'

const directories: string[] = []
afterEach(async () => Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true }))))

async function dataset() {
  const root = await mkdtemp(join(tmpdir(), 'opensymbols-cloud-benchmark-'))
  directories.push(root)
  const result = await generateSearchData({ preset: 'relevance', seed: 42, compression: 'gzip', output: join(root, 'data') })
  return result.output
}

describe('Meilisearch import transformation', () => {
  it('finds an exact localization cutoff and produces stable provider-neutral documents', async () => {
    const input = await dataset()
    expect(await inspectCutoff(input, 12)).toEqual({ documentCount: 12, maximumSymbolId: 2 })
    const documents = []
    for await (const document of transformDocuments(input, 12)) documents.push(document)
    expect(documents).toHaveLength(12)
    expect(documents[0]).toMatchObject({
      id: '1_en', symbolId: 1, repoKey: 'core-aac', locale: 'en', safe: true,
      visible: true, imageUrl: expect.stringContaining('assets.example.invalid'),
      license: 'CC0-1.0', author: 'OpenSymbols synthetic benchmark', hasSkin: true,
    })
    expect(documents[1]!.text).toContain(documents[0]!.name)
    expect(new Set(documents.map((document) => document.id)).size).toBe(12)
  })

  it('creates repository documents with symbol counts and visibility metadata', async () => {
    const input = await dataset()
    const repositories = []
    for await (const repository of transformRepositories(input, 200)) repositories.push(repository)
    expect(repositories).toHaveLength(24)
    expect(repositories[0]).toMatchObject({
      id: 'core-aac', repoKey: 'core-aac', active: true, protected: false,
      license: 'CC0-1.0', symbolCount: 198,
    })
    expect(repositories.filter((repository) => repository.active && !repository.protected)).toHaveLength(22)
  })

  it('rejects a dataset smaller than the requested cutoff', async () => {
    await expect(inspectCutoff(await dataset(), 1_201)).rejects.toThrow('are required')
  })
})
