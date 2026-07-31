import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { completedForCheckpoint, uploadCheckpoint, uploadWithCheckpoint } from './checkpoint.js'
import { readJsonl } from './jsonl.js'
import { MeilisearchImportClient, MeilisearchImportError } from './meilisearch.js'
import { POSTGRES_EXPORT_GENERATOR, type PostgresExportManifest } from './postgres-export.js'
import type { RepositoryDocument, SearchDocument } from './types.js'

export interface RebuildConfig {
  host: string
  indexApiKey: string
  documentLimit: number
  stableSymbolIndex?: string
  stableRepositoryIndex?: string
}

export interface RebuildBuild {
  directory: string
  manifest: PostgresExportManifest
  symbolCandidate: string
  repositoryCandidate: string
}

function requiredString(value: unknown, name: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Invalid ${name} in export manifest.`)
  return value
}

async function sha256(path: string) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

function exportFileName(value: unknown, name: string) {
  const filename = requiredString(value, name)
  if (!/^[A-Za-z0-9._-]+\.jsonl\.gz$/.test(filename)) {
    throw new Error(`Invalid ${name} in export manifest.`)
  }
  return filename
}

export async function loadBuild(input: string): Promise<RebuildBuild> {
  const directory = resolve(input)
  const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8')) as PostgresExportManifest
  if (manifest.generator !== POSTGRES_EXPORT_GENERATOR || manifest.schemaVersion !== 1) {
    throw new Error('Input is not an OpenSymbols PostgreSQL search export.')
  }
  const buildHash = requiredString(manifest.buildHash, 'buildHash')
  if (!/^[a-f0-9]{64}$/.test(buildHash)) throw new Error('Invalid buildHash in export manifest.')
  const repositoryFile = exportFileName(manifest.files?.repositories?.name, 'repository filename')
  const documentFile = exportFileName(manifest.files?.documents?.name, 'document filename')
  const expectedRepositoryHash = requiredString(manifest.files?.repositories?.sha256, 'repository hash')
  const expectedDocumentHash = requiredString(manifest.files?.documents?.sha256, 'document hash')
  const { buildHash: ignoredBuildHash, ...stableManifest } = manifest
  void ignoredBuildHash
  const calculatedBuildHash = createHash('sha256').update(JSON.stringify(stableManifest)).digest('hex')
  if (calculatedBuildHash !== buildHash) throw new Error('Export manifest build hash does not match its contents.')
  const [repositoryHash, documentHash] = await Promise.all([
    sha256(join(directory, repositoryFile)),
    sha256(join(directory, documentFile)),
  ])
  if (repositoryHash !== expectedRepositoryHash || documentHash !== expectedDocumentHash) {
    throw new Error('Export data hash does not match the manifest.')
  }
  return {
    directory,
    manifest,
    symbolCandidate: `symbols_candidate_${buildHash.slice(0, 12)}`,
    repositoryCandidate: `repositories_candidate_${buildHash.slice(0, 12)}`,
  }
}

function client(config: RebuildConfig) {
  return new MeilisearchImportClient({ host: config.host, adminApiKey: config.indexApiKey })
}

async function safeStats(importer: MeilisearchImportClient, index: string) {
  try {
    return await importer.stats(index)
  } catch (error) {
    if (error instanceof MeilisearchImportError && error.status === 404) {
      return { numberOfDocuments: 0, isIndexing: false }
    }
    throw error
  }
}

export async function preflightBuild(config: RebuildConfig, build: RebuildBuild) {
  if (!Number.isSafeInteger(config.documentLimit) || config.documentLimit < 1) {
    throw new Error('MEILISEARCH_DOCUMENT_LIMIT must be a positive integer.')
  }
  const importer = client(config)
  const stableSymbols = config.stableSymbolIndex ?? 'symbols'
  const stableRepositories = config.stableRepositoryIndex ?? 'repositories'
  const visibleIndexes = await importer.indexes()
  const indexNames = new Set((visibleIndexes.results ?? []).flatMap((index) => index.uid ? [index.uid] : []))
  indexNames.add(stableSymbols)
  indexNames.add(stableRepositories)
  indexNames.add(build.symbolCandidate)
  indexNames.add(build.repositoryCandidate)
  const stats = await Promise.all([...indexNames].map(async (index) => [index, await safeStats(importer, index)] as const))
  const documentsByIndex = new Map(stats.map(([index, value]) => [index, Number(value.numberOfDocuments ?? 0)]))
  const existingDocuments = [...documentsByIndex.values()].reduce((sum, count) => sum + count, 0)
  const existingCandidateDocuments =
    (documentsByIndex.get(build.symbolCandidate) ?? 0) + (documentsByIndex.get(build.repositoryCandidate) ?? 0)
  const candidateDocuments = build.manifest.counts.documents + build.manifest.counts.repositories
  const projectedDocuments = existingDocuments - existingCandidateDocuments + candidateDocuments
  const result = {
    existingDocuments,
    candidateDocuments,
    existingCandidateDocuments,
    projectedDocuments,
    documentLimit: config.documentLimit,
    fits: projectedDocuments <= config.documentLimit,
  }
  if (!result.fits) {
    throw new Error(`Meilisearch capacity exceeded: ${projectedDocuments} projected documents > ${config.documentLimit}.`)
  }
  return result
}

export async function buildCandidates(config: RebuildConfig, build: RebuildBuild) {
  await preflightBuild(config, build)
  const importer = client(config)
  await importer.configureIndexes(build.symbolCandidate, build.repositoryCandidate)
  const [symbolInfo, repositoryInfo] = await Promise.all([
    importer.indexInfo(build.symbolCandidate),
    importer.indexInfo(build.repositoryCandidate),
  ])
  if (!symbolInfo.createdAt || !repositoryInfo.createdAt) {
    throw new Error('A candidate index has no creation time.')
  }

  const repositories: RepositoryDocument[] = []
  for await (const repository of readJsonl<RepositoryDocument>(
    join(build.directory, build.manifest.files.repositories.name),
  )) repositories.push(repository)
  const repositoryTask = await importer.uploadRepositoriesTo(
    build.repositoryCandidate, repositories, `opensymbols:${build.manifest.buildHash}:repositories`,
  )
  if (typeof repositoryTask.taskUid !== 'number') throw new Error('Meilisearch did not return a repository task UID.')
  await importer.waitForTask(repositoryTask.taskUid)

  const checkpointPath = join(build.directory, 'meilisearch-rebuild.checkpoint.json')
  const identity = {
    sourceManifestSha256: build.manifest.buildHash,
    documentsSha256: build.manifest.files.documents.sha256,
    host: config.host.replace(/\/$/, ''),
    symbolIndex: build.symbolCandidate,
    symbolIndexCreatedAt: symbolInfo.createdAt,
    repositoryIndex: build.repositoryCandidate,
    repositoryIndexCreatedAt: repositoryInfo.createdAt,
  }
  let completed = 0
  let lastAcknowledgedDocumentId: string | undefined
  try {
    const stored = JSON.parse(await readFile(checkpointPath, 'utf8')) as Record<string, unknown>
    completed = completedForCheckpoint(stored, identity)
    lastAcknowledgedDocumentId = typeof stored.lastAcknowledgedDocumentId === 'string'
      ? stored.lastAcknowledgedDocumentId
      : undefined
    const expected = uploadCheckpoint(Number(stored.completed ?? 0), identity, lastAcknowledgedDocumentId)
    if (JSON.stringify(stored) !== JSON.stringify(expected)) {
      throw new Error('Existing Meilisearch checkpoint does not match this build.')
    }
  } catch {
    try {
      await readFile(checkpointPath)
      throw new Error('Existing Meilisearch checkpoint does not match this build.')
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        // A missing checkpoint starts a safe idempotent upload from the beginning.
      } else {
        throw error
      }
    }
  }
  completed = await uploadWithCheckpoint({
    records: readJsonl<SearchDocument>(join(build.directory, build.manifest.files.documents.name)),
    completed,
    batchSize: 500,
    async upload(batch) {
      const task = await importer.uploadSymbolsTo(
        build.symbolCandidate, batch, `opensymbols:${build.manifest.buildHash}:${batch[0]?.id ?? 'empty'}`,
      )
      if (typeof task.taskUid !== 'number') throw new Error('Meilisearch did not return a symbol task UID.')
      await importer.waitForTask(task.taskUid)
      lastAcknowledgedDocumentId = batch.at(-1)?.id
    },
    async save(count) {
      await writeFile(
        checkpointPath,
        `${JSON.stringify(uploadCheckpoint(count, identity, lastAcknowledgedDocumentId))}\n`,
      )
    },
  })
  return { repositories: repositories.length, documents: completed, ...identity }
}

function comparableSymbol(document: SearchDocument) {
  const { text, ...displayed } = document
  void text
  return displayed
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

export async function verifyCandidates(config: RebuildConfig, build: RebuildBuild) {
  const importer = client(config)
  const [symbolStats, repositoryStats] = await Promise.all([
    importer.stats(build.symbolCandidate),
    importer.stats(build.repositoryCandidate),
  ])
  if (symbolStats.isIndexing || repositoryStats.isIndexing) throw new Error('Candidate indexing is still active.')
  if (symbolStats.numberOfDocuments !== build.manifest.counts.documents) {
    throw new Error(`Candidate symbol count mismatch: ${symbolStats.numberOfDocuments}.`)
  }
  if (repositoryStats.numberOfDocuments !== build.manifest.counts.repositories) {
    throw new Error(`Candidate repository count mismatch: ${repositoryStats.numberOfDocuments}.`)
  }

  const expectedSymbols = new Map<string, Omit<SearchDocument, 'text'>>()
  const expectedLocales = new Map<string, number>()
  let expectedUnsafe = 0
  for await (const document of readJsonl<SearchDocument>(join(build.directory, build.manifest.files.documents.name))) {
    expectedSymbols.set(document.id, comparableSymbol(document))
    expectedLocales.set(document.locale, (expectedLocales.get(document.locale) ?? 0) + 1)
    if (!document.safe) expectedUnsafe += 1
  }
  const actualLocales = new Map<string, number>()
  let actualUnsafe = 0
  for (let offset = 0; offset < build.manifest.counts.documents; offset += 1_000) {
    const page = await importer.documents<SearchDocument>(build.symbolCandidate, offset, 1_000)
    for (const document of page.results ?? []) {
      const expected = expectedSymbols.get(document.id)
      if (!expected) throw new Error(`Unexpected candidate document ${document.id}.`)
      if (!document.visible || document.protected || !document.enabled) {
        throw new Error(`Non-public candidate document ${document.id}.`)
      }
      if (canonical(comparableSymbol(document)) !== canonical(expected)) {
        throw new Error(`Candidate document mismatch for ${document.id}.`)
      }
      expectedSymbols.delete(document.id)
      actualLocales.set(document.locale, (actualLocales.get(document.locale) ?? 0) + 1)
      if (!document.safe) actualUnsafe += 1
    }
  }
  if (expectedSymbols.size) throw new Error(`Candidate is missing ${expectedSymbols.size} documents.`)
  if (JSON.stringify(Object.fromEntries(actualLocales)) !== JSON.stringify(Object.fromEntries(expectedLocales))) {
    throw new Error('Candidate locale distribution mismatch.')
  }
  if (actualUnsafe !== expectedUnsafe) throw new Error('Candidate unsafe-symbol count mismatch.')

  const expectedRepositories = new Set<string>()
  for await (const repository of readJsonl<RepositoryDocument>(
    join(build.directory, build.manifest.files.repositories.name),
  )) expectedRepositories.add(repository.id)
  const repositoryPage = await importer.documents<RepositoryDocument>(
    build.repositoryCandidate, 0, build.manifest.counts.repositories,
  )
  for (const repository of repositoryPage.results ?? []) {
    if (!repository.active || repository.protected || !expectedRepositories.delete(repository.id)) {
      throw new Error(`Unexpected candidate repository ${repository.id}.`)
    }
  }
  if (expectedRepositories.size) throw new Error(`Candidate is missing ${expectedRepositories.size} repositories.`)

  const smoke = await importer.searchIndex<SearchDocument>(build.symbolCandidate, {
    q: '', limit: 1, filter: ['visible = true', 'locale = "en"'], sort: ['symbolId:asc'],
  })
  if (!smoke.hits?.length) throw new Error('Candidate search smoke test returned no public English document.')
  return {
    documents: build.manifest.counts.documents,
    repositories: build.manifest.counts.repositories,
    locales: Object.fromEntries(actualLocales),
    unsafeDocuments: actualUnsafe,
  }
}

export async function activateBuild(config: RebuildConfig, build: RebuildBuild) {
  await verifyCandidates(config, build)
  const importer = client(config)
  await importer.swapIndexes([
    [config.stableSymbolIndex ?? 'symbols', build.symbolCandidate],
    [config.stableRepositoryIndex ?? 'repositories', build.repositoryCandidate],
  ])
  const [symbols, repositories] = await Promise.all([
    importer.stats(config.stableSymbolIndex ?? 'symbols'),
    importer.stats(config.stableRepositoryIndex ?? 'repositories'),
  ])
  if (symbols.numberOfDocuments !== build.manifest.counts.documents ||
      repositories.numberOfDocuments !== build.manifest.counts.repositories) {
    throw new Error('Stable index counts do not match the activated build.')
  }
  return { activated: build.manifest.buildHash }
}

export async function rollbackBuild(config: RebuildConfig, build: RebuildBuild) {
  const importer = client(config)
  await importer.swapIndexes([
    [config.stableSymbolIndex ?? 'symbols', build.symbolCandidate],
    [config.stableRepositoryIndex ?? 'repositories', build.repositoryCandidate],
  ])
  return { rolledBack: build.manifest.buildHash }
}

export async function cleanupBuild(config: RebuildConfig, build: RebuildBuild, confirmation: string) {
  if (confirmation !== build.manifest.buildHash) throw new Error('Cleanup confirmation does not match the build hash.')
  const importer = client(config)
  const [symbols, repositories] = await Promise.all([
    importer.stats(config.stableSymbolIndex ?? 'symbols'),
    importer.stats(config.stableRepositoryIndex ?? 'repositories'),
  ])
  if (symbols.numberOfDocuments !== build.manifest.counts.documents ||
      repositories.numberOfDocuments !== build.manifest.counts.repositories) {
    throw new Error('Stable indexes do not match this build; cleanup refused.')
  }
  await importer.deleteIndex(build.symbolCandidate)
  await importer.deleteIndex(build.repositoryCandidate)
  return { cleaned: build.manifest.buildHash }
}
