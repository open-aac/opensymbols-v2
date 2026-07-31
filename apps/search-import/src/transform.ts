import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { readJsonl, writeJsonl } from './jsonl.js'
import type { LocalizationRecord, RepositoryDocument, RepositoryRecord, SearchDocument, SymbolRecord } from './types.js'

export const BENCHMARK_DOCUMENT_COUNT = 100_000

export function searchDocumentId(symbolId: number, locale: string) {
  return `${symbolId}_${locale.replaceAll('-', '_')}`
}

function inputPath(directory: string, name: string) {
  return join(directory, `${name}.jsonl.gz`)
}

export function documentText(localization: LocalizationRecord, english: LocalizationRecord) {
  const boosts = Object.entries(localization.keywordBoosts).flatMap(([term, weight]) => Array(Math.max(1, Math.round(weight))).fill(term))
  return [localization.name, localization.description, ...localization.searchTerms, ...localization.synonyms, ...boosts, english.name]
    .filter(Boolean).join('\n')
}

export async function inspectCutoff(datasetDirectory: string, limit = BENCHMARK_DOCUMENT_COUNT) {
  let count = 0
  let maximumSymbolId = 0
  for await (const localization of readJsonl<LocalizationRecord>(inputPath(datasetDirectory, 'localizations'))) {
    count += 1
    maximumSymbolId = localization.symbolId
    if (count === limit) break
  }
  if (count !== limit) throw new Error(`Dataset contains ${count} localizations; ${limit} are required.`)
  return { documentCount: count, maximumSymbolId }
}

export async function* transformDocuments(datasetDirectory: string, limit = BENCHMARK_DOCUMENT_COUNT): AsyncGenerator<SearchDocument> {
  const { maximumSymbolId } = await inspectCutoff(datasetDirectory, limit)
  const repositories = new Map<string, RepositoryRecord>()
  for await (const repository of readJsonl<RepositoryRecord>(inputPath(datasetDirectory, 'repositories'))) repositories.set(repository.repoKey, repository)
  const symbols = new Map<number, SymbolRecord>()
  for await (const symbol of readJsonl<SymbolRecord>(inputPath(datasetDirectory, 'symbols'))) {
    if (symbol.id > maximumSymbolId) break
    symbols.set(symbol.id, symbol)
  }

  let count = 0
  let group: LocalizationRecord[] = []
  const emitGroup = function* () {
    if (!group.length) return
    const english = group.find((item) => item.locale === 'en')
    if (!english) throw new Error(`Symbol ${group[0]!.symbolId} has no English localization.`)
    const symbol = symbols.get(english.symbolId)
    if (!symbol) throw new Error(`Missing symbol ${english.symbolId}.`)
    const repository = repositories.get(symbol.repoKey)
    if (!repository) throw new Error(`Missing repository ${symbol.repoKey}.`)
    for (const localization of group) {
      yield {
        id: searchDocumentId(symbol.id, localization.locale),
        symbolId: symbol.id,
        symbolKey: symbol.symbolKey,
        repoKey: symbol.repoKey,
        locale: localization.locale,
        safe: !symbol.unsafe,
        visible: symbol.enabled && !symbol.protected && repository.active && !repository.protected,
        name: localization.name,
        description: localization.description,
        englishName: english.name,
        englishDescription: english.description,
        searchTerms: localization.searchTerms,
        synonyms: localization.synonyms,
        keywordBoosts: Object.entries(localization.keywordBoosts).map(([term, weight]) => ({ term, weight })),
        text: documentText(localization, english),
        imageUrl: symbol.imageUrl,
        enabled: symbol.enabled,
        protected: symbol.protected,
        hasSkin: symbol.hasSkin,
        hasVariants: symbol.hasVariants,
        license: symbol.attribution.license,
        licenseUrl: null,
        author: symbol.attribution.author,
        authorUrl: null,
        sourceUrl: null,
        extension: 'svg',
      } satisfies SearchDocument
    }
  }

  for await (const localization of readJsonl<LocalizationRecord>(inputPath(datasetDirectory, 'localizations'))) {
    if (count === limit) break
    if (group.length && group[0]!.symbolId !== localization.symbolId) {
      yield* emitGroup()
      group = []
    }
    group.push(localization)
    count += 1
  }
  yield* emitGroup()
}

export async function* transformRepositories(
  datasetDirectory: string,
  maximumSymbolId: number,
): AsyncGenerator<RepositoryDocument> {
  const repositories: RepositoryRecord[] = []
  for await (const repository of readJsonl<RepositoryRecord>(inputPath(datasetDirectory, 'repositories'))) {
    repositories.push(repository)
  }
  const counts = new Map<string, number>()
  for await (const symbol of readJsonl<SymbolRecord>(inputPath(datasetDirectory, 'symbols'))) {
    if (symbol.id > maximumSymbolId) break
    if (symbol.enabled && !symbol.protected) {
      counts.set(symbol.repoKey, (counts.get(symbol.repoKey) ?? 0) + 1)
    }
  }
  for (const repository of repositories) {
    yield {
      id: repository.repoKey,
      repoKey: repository.repoKey,
      name: repository.name,
      description: repository.description,
      active: repository.active,
      protected: repository.protected,
      license: repository.attribution.license,
      licenseUrl: null,
      author: repository.attribution.author,
      authorUrl: null,
      url: null,
      symbolCount: counts.get(repository.repoKey) ?? 0,
    }
  }
}

export async function prepareDataset(datasetDirectory: string, outputDirectory: string) {
  const output = resolve(outputDirectory)
  await mkdir(output, { recursive: false })
  const cutoff = await inspectCutoff(datasetDirectory)
  await writeJsonl(join(output, 'documents.jsonl.gz'), transformDocuments(datasetDirectory))
  await writeJsonl(
    join(output, 'repositories.jsonl.gz'),
    transformRepositories(datasetDirectory, cutoff.maximumSymbolId),
  )
  await writeFile(join(output, 'manifest.json'), `${JSON.stringify({ schemaVersion: 1, ...cutoff }, null, 2)}\n`, { flag: 'wx' })
  await writeFile(join(output, 'source-manifest.json'), await readFile(join(datasetDirectory, 'manifest.json')), { flag: 'wx' })
  return cutoff
}
