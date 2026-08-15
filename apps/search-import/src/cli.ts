import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readJsonl } from './jsonl.js'
import { MeilisearchImportClient, MeilisearchImportError } from './meilisearch.js'
import { exportPostgresSearchData } from './postgres-export.js'
import {
  activateBuild,
  buildCandidates,
  cleanupBuild,
  loadBuild,
  preflightBuild,
  rollbackBuild,
  verifyCandidates,
  type RebuildConfig,
} from './rebuild.js'
import { BENCHMARK_DOCUMENT_COUNT, prepareDataset } from './transform.js'
import type { RepositoryDocument, SearchDocument } from './types.js'
import {
  completedForCheckpoint,
  uploadCheckpoint,
  uploadWithCheckpoint,
  type CheckpointIdentity,
} from './checkpoint.js'

const packageRoot = fileURLToPath(new URL('../', import.meta.url))
const repositoryRoot = resolve(packageRoot, '../..')
const defaultDataset = join(repositoryRoot, '.benchmark-data', '100k-seed-42')
const defaultPrepared = join(repositoryRoot, '.benchmark-data', 'meilisearch-100k-seed-42')
const defaultSearchData = join(repositoryRoot, '.search-data')
const PREPARED_ID = 'opensymbols-meilisearch-import-v1'

function option(name: string, fallback?: string) {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : fallback
}

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required in the active environment file.`)
  return value
}

function rebuildConfig(): RebuildConfig {
  return {
    host: requiredEnvironment('MEILISEARCH_HOST'),
    indexApiKey: requiredEnvironment('MEILISEARCH_INDEX_API_KEY'),
    documentLimit: Number(requiredEnvironment('MEILISEARCH_DOCUMENT_LIMIT')),
    stableSymbolIndex: process.env.MEILISEARCH_SYMBOL_INDEX,
    stableRepositoryIndex: process.env.MEILISEARCH_REPOSITORY_INDEX,
  }
}

function inputBuild() {
  const input = option('input')
  if (!input) throw new Error('--input is required.')
  return loadBuild(resolve(repositoryRoot, input))
}

async function postgresExport() {
  const snapshotId = option('snapshot-id')
  if (!snapshotId) throw new Error('--snapshot-id is required.')
  const output = resolve(repositoryRoot, option('output', join(defaultSearchData, `postgres-${snapshotId}`))!)
  const result = await exportPostgresSearchData({
    connectionString: requiredEnvironment('DATABASE_URL'),
    s3Bucket: requiredEnvironment('S3_BUCKET'),
    s3Cdn: requiredEnvironment('S3_CDN'),
    snapshotId,
    outputDirectory: output,
    force: process.argv.includes('--force'),
  })
  console.log(JSON.stringify({ output: result.output, ...result.manifest.counts, buildHash: result.manifest.buildHash }, null, 2))
  return result
}

async function indexPreflight() {
  console.log(JSON.stringify(await preflightBuild(rebuildConfig(), await inputBuild()), null, 2))
}

async function indexBuild() {
  console.log(JSON.stringify(await buildCandidates(rebuildConfig(), await inputBuild()), null, 2))
}

async function indexVerify() {
  console.log(JSON.stringify(await verifyCandidates(rebuildConfig(), await inputBuild()), null, 2))
}

async function indexActivate() {
  console.log(JSON.stringify(await activateBuild(rebuildConfig(), await inputBuild()), null, 2))
}

async function indexRollback() {
  console.log(JSON.stringify(await rollbackBuild(rebuildConfig(), await inputBuild()), null, 2))
}

async function indexCleanup() {
  const confirmation = option('confirm-build')
  if (!confirmation) throw new Error('--confirm-build is required.')
  console.log(JSON.stringify(await cleanupBuild(rebuildConfig(), await inputBuild(), confirmation), null, 2))
}

async function rebuild() {
  const exported = await postgresExport()
  const build = await loadBuild(exported.output)
  const config = rebuildConfig()
  console.log(JSON.stringify(await preflightBuild(config, build), null, 2))
  console.log(JSON.stringify(await buildCandidates(config, build), null, 2))
  console.log(JSON.stringify(await verifyCandidates(config, build), null, 2))
  console.log(JSON.stringify({ readyForActivation: build.manifest.buildHash }, null, 2))
}

function client() {
  return new MeilisearchImportClient({
    host: requiredEnvironment('MEILISEARCH_HOST'),
    adminApiKey: requiredEnvironment('MEILISEARCH_API_KEY'),
    symbolIndex: process.env.MEILISEARCH_SYMBOL_INDEX,
    repositoryIndex: process.env.MEILISEARCH_REPOSITORY_INDEX,
  })
}

async function exists(path: string) {
  try { await stat(path); return true } catch { return false }
}

async function sha256File(path: string) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

async function prepare() {
  const dataset = resolve(option('dataset', defaultDataset)!)
  const output = resolve(option('output', defaultPrepared)!)
  if (!await exists(join(dataset, 'manifest.json'))) {
    const pnpmCli = process.env.npm_execpath
    if (!pnpmCli) throw new Error('Run prepare through pnpm search:prepare.')
    const run = spawnSync(process.execPath, [pnpmCli, 'data:generate', '--preset', '100k', '--seed', '42'], {
      cwd: repositoryRoot, stdio: 'inherit',
    })
    if (run.status !== 0) throw new Error('Dataset generation failed.')
  }
  if (await exists(output)) {
    const manifest = JSON.parse(await readFile(join(output, 'manifest.json'), 'utf8')) as { generator?: string }
    if (!process.argv.includes('--force') || manifest.generator !== PREPARED_ID) {
      throw new Error(`Prepared output exists. Pass --force only for importer-owned output: ${output}`)
    }
    await rm(output, { recursive: true })
  }
  const cutoff = await prepareDataset(dataset, output)
  const manifestPath = join(output, 'manifest.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, unknown>
  await writeFile(manifestPath, `${JSON.stringify({ generator: PREPARED_ID, ...manifest }, null, 2)}\n`)
  console.log(JSON.stringify({ output, ...cutoff }, null, 2))
}

async function checkpoint(path: string, identity: CheckpointIdentity) {
  return await exists(path)
    ? completedForCheckpoint(JSON.parse(await readFile(path, 'utf8')), identity)
    : 0
}

async function importData() {
  const prepared = resolve(option('prepared', defaultPrepared)!)
  const importer = client()
  await importer.configure()
  const repositories: RepositoryDocument[] = []
  for await (const item of readJsonl<RepositoryDocument>(join(prepared, 'repositories.jsonl.gz'))) {
    repositories.push(item)
  }
  const repositoryTask = await importer.uploadRepositories(repositories)
  if (typeof repositoryTask.taskUid !== 'number') throw new Error('Meilisearch did not return a task UID.')
  await importer.waitForTask(repositoryTask.taskUid)

  const checkpointPath = join(prepared, 'meilisearch.checkpoint.json')
  const sourceManifest = await readFile(join(prepared, 'source-manifest.json'))
  const index = await importer.indexInfo(importer.symbolIndex)
  if (!index.createdAt) throw new Error('Meilisearch did not return the symbol index creation time.')
  const identity: CheckpointIdentity = {
    sourceManifestSha256: createHash('sha256').update(sourceManifest).digest('hex'),
    documentsSha256: await sha256File(join(prepared, 'documents.jsonl.gz')),
    host: requiredEnvironment('MEILISEARCH_HOST').replace(/\/$/, ''),
    symbolIndex: importer.symbolIndex,
    symbolIndexCreatedAt: index.createdAt,
  }
  const completed = await uploadWithCheckpoint({
    records: readJsonl<SearchDocument>(join(prepared, 'documents.jsonl.gz')),
    completed: await checkpoint(checkpointPath, identity),
    batchSize: 500,
    async upload(batch) {
      const task = await importer.uploadSymbols(batch)
      if (typeof task.taskUid !== 'number') throw new Error('Meilisearch did not return a task UID.')
      await importer.waitForTask(task.taskUid)
    },
    async save(count) {
      await writeFile(checkpointPath, `${JSON.stringify(uploadCheckpoint(count, identity))}\n`)
    },
  })
  console.log(JSON.stringify({ repositories: repositories.length, documents: completed }, null, 2))
}

async function verify() {
  const importer = client()
  const [symbols, repositories, publicRepositories] = await Promise.all([
    importer.stats(importer.symbolIndex),
    importer.stats(importer.repositoryIndex),
    importer.publicRepositoryCount(),
  ])
  const result = {
    documents: symbols.numberOfDocuments ?? 0,
    repositories: repositories.numberOfDocuments ?? 0,
    publicRepositories,
    indexing: Boolean(symbols.isIndexing || repositories.isIndexing),
  }
  if (result.documents !== BENCHMARK_DOCUMENT_COUNT || result.repositories !== 24 ||
      result.publicRepositories !== 22 || result.indexing) {
    throw new Error(`Meilisearch verification failed: ${JSON.stringify(result)}`)
  }
  console.log(JSON.stringify(result, null, 2))
}

async function main() {
  const command = process.argv[2]
  if (command === 'prepare') return prepare()
  if (command === 'import') return importData()
  if (command === 'verify') return verify()
  if (command === 'postgres-export') return postgresExport()
  if (command === 'index-preflight') return indexPreflight()
  if (command === 'index-build') return indexBuild()
  if (command === 'index-verify') return indexVerify()
  if (command === 'index-activate') return indexActivate()
  if (command === 'index-rollback') return indexRollback()
  if (command === 'index-cleanup') return indexCleanup()
  if (command === 'rebuild') return rebuild()
  throw new Error('Usage: search-import prepare|import|verify|postgres-export|index-preflight|index-build|index-verify|index-activate|index-rollback|index-cleanup|rebuild')
}

main().catch((error) => {
  if (error instanceof MeilisearchImportError && error.retryable) {
    console.error('The checkpoint is safe; rerun the import after the quota or transient failure clears.')
  }
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
