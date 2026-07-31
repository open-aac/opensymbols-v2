import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { Pool, type PoolClient, type QueryResultRow } from 'pg'
import { writeJsonl } from './jsonl.js'
import { decodeGoSecure, objectValue, type JsonValue } from './secure.js'
import type { RepositoryDocument, SearchDocument } from './types.js'

export const POSTGRES_EXPORT_GENERATOR = 'opensymbols-postgres-search-export-v1'
const OWNERSHIP_FILE = '.opensymbols-search-export.json'

interface RepositoryRow extends QueryResultRow {
  id: number
  repo_key: string
  settings: string | null
}

interface ModifierRow extends QueryResultRow {
  id: number
  repo_key: string
  locale: string | null
  settings: string | null
}

interface SymbolRow extends QueryResultRow {
  id: number
  repo_key: string
  symbol_key: string
  enabled: boolean | null
  has_skin: boolean | null
  unsafe_result: boolean | null
  settings: string | null
}

type Settings = Record<string, JsonValue>

export interface PostgresExportManifest {
  generator: typeof POSTGRES_EXPORT_GENERATOR
  schemaVersion: 1
  snapshotId: string
  postgresVersion: string
  buildHash: string
  counts: { repositories: number; symbols: number; documents: number }
  excluded: { repositories: number; disabledSymbols: number; protectedSymbols: number; hiddenRepositorySymbols: number }
  locales: Record<string, number>
  symbolIds: { minimum: number | null; maximum: number | null }
  files: {
    repositories: { name: string; sha256: string }
    documents: { name: string; sha256: string }
  }
}

export interface PostgresExportOptions {
  connectionString: string
  encryptionKey: string
  s3Bucket: string
  s3Cdn: string
  snapshotId: string
  outputDirectory: string
  batchSize?: number
  force?: boolean
}

function stringValue(value: JsonValue | undefined) {
  return typeof value === 'string' ? value : null
}

function settings(value: string | null, encryptionKey: string, identity: string): Settings {
  if (!value) throw new Error(`Missing secure settings for ${identity}.`)
  try {
    return objectValue(decodeGoSecure(value, encryptionKey))
  } catch {
    throw new Error(`Unable to decode secure settings for ${identity}.`)
  }
}

function recordValue(value: JsonValue | undefined): Settings {
  return value && !Array.isArray(value) && typeof value === 'object' ? value : {}
}

export function normalizeLocale(value: string) {
  const locale = value.trim().toLowerCase().replaceAll('_', '-')
  if (locale === 'zh-cn' || locale === 'zh-sg' || locale === 'zh-hans' || locale.startsWith('zh-hans-')) {
    return 'zh-CN'
  }
  return locale.split('-')[0] || 'en'
}

function fullImageUrl(value: JsonValue | undefined, bucket: string, cdn: string) {
  let url = stringValue(value)
  if (!url) return ''
  if (url.startsWith('/')) url = `https://s3.amazonaws.com/${bucket}${url}`
  const virtualHosted = `https://${bucket}.s3.amazonaws.com/`
  const pathStyle = `https://s3.amazonaws.com/${bucket}/`
  if (url.startsWith(virtualHosted)) return `${cdn.replace(/\/$/, '')}/${url.slice(virtualHosted.length)}`
  if (url.startsWith(pathStyle)) return `${cdn.replace(/\/$/, '')}/${url.slice(pathStyle.length)}`
  return url
}

function normalizedLocales(symbol: Settings) {
  const raw = recordValue(symbol.locales)
  const candidates = Object.entries(raw)
    .map(([locale, value]) => ({ raw: locale, locale: normalizeLocale(locale), value: recordValue(value) }))
    .sort((left, right) => {
      const leftExact = left.raw.toLowerCase().replaceAll('_', '-') === left.locale.toLowerCase() ? 0 : 1
      const rightExact = right.raw.toLowerCase().replaceAll('_', '-') === right.locale.toLowerCase() ? 0 : 1
      return leftExact - rightExact || left.raw.localeCompare(right.raw)
    })
  const result = new Map<string, Settings>()
  for (const item of candidates) if (!result.has(item.locale)) result.set(item.locale, item.value)
  return result
}

function useScores(value: JsonValue | undefined) {
  const scores = recordValue(value)
  const result = new Map<string, number>()
  for (const [term, score] of Object.entries(scores)) {
    if (term.trim() && typeof score === 'number' && Number.isFinite(score) && score > 0) {
      result.set(term.trim().toLowerCase(), Math.min(10, Math.max(1, Math.round(score))))
    }
  }
  return result
}

function documentText(
  name: string,
  description: string,
  searchTerms: string[],
  boosts: Map<string, number>,
  englishName: string,
  englishDescription: string,
) {
  const weighted = [...boosts.entries()].sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([term, weight]) => Array(weight).fill(term))
  return [name, description, ...searchTerms, ...weighted, englishName, englishDescription]
    .filter(Boolean).join('\n')
}

export function searchDocumentsForSymbol(
  row: SymbolRow,
  symbol: Settings,
  defaults: Map<string, string[]>,
  image: { bucket: string; cdn: string },
) {
  const locales = normalizedLocales(symbol)
  const base: Settings = {
    name: symbol.name ?? null,
    description: symbol.description ?? null,
    search_string: symbol.search_string ?? null,
    use_scores: {},
  }
  const english = { ...base, ...(locales.get('en') ?? {}) }
  locales.set('en', english)
  const englishName = stringValue(english.name) ?? ''
  const englishDescription = stringValue(english.description) ?? ''
  const documents: SearchDocument[] = []

  for (const [locale, localized] of [...locales.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const name = stringValue(localized.name) ?? englishName
    const description = stringValue(localized.description) ?? englishDescription
    const search = stringValue(localized.search_string)
    const boosts = useScores(localized.use_scores)
    for (const term of defaults.get(`${locale}\0${row.symbol_key}`) ?? []) {
      boosts.set(term, Math.max(boosts.get(term) ?? 0, 5))
    }
    const searchTerms = search ? [search] : []
    if (locale !== 'en' && !name && !description && !searchTerms.length && !boosts.size) continue
    documents.push({
      id: `${row.id}_${locale.replaceAll('-', '_')}`,
      symbolId: row.id,
      symbolKey: row.symbol_key,
      repoKey: row.repo_key,
      locale,
      safe: !(row.unsafe_result === true || symbol.unsafe_result === true),
      visible: true,
      name,
      description,
      englishName,
      englishDescription,
      searchTerms,
      synonyms: [],
      keywordBoosts: [...boosts.entries()].sort(([left], [right]) => left.localeCompare(right))
        .map(([term, weight]) => ({ term, weight })),
      text: documentText(name, description, searchTerms, boosts, englishName, englishDescription),
      imageUrl: fullImageUrl(symbol.image_url, image.bucket, image.cdn),
      enabled: true,
      protected: false,
      hasSkin: row.has_skin === true || symbol.has_skin === true,
      hasVariants: symbol.has_variants === true,
      license: stringValue(symbol.license),
      licenseUrl: stringValue(symbol.license_url),
      author: stringValue(symbol.author),
      authorUrl: stringValue(symbol.author_url),
      sourceUrl: stringValue(symbol.source_url),
      extension: stringValue(symbol.file_extension),
    })
  }
  return documents
}

async function sha256(path: string) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

async function owned(path: string) {
  try {
    const marker = JSON.parse(await readFile(join(path, OWNERSHIP_FILE), 'utf8')) as { generator?: string }
    return marker.generator === POSTGRES_EXPORT_GENERATOR
  } catch {
    return false
  }
}

async function prepareOutput(path: string, force: boolean) {
  try {
    await stat(path)
    if (!force || !await owned(path)) throw new Error(`Output exists and is not safely replaceable: ${path}`)
    await rm(path, { recursive: true })
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      // Expected for a new export.
    } else if (error instanceof Error && error.message.startsWith('Output exists')) {
      throw error
    }
  }
  await mkdir(path, { recursive: true })
  await writeFile(join(path, OWNERSHIP_FILE), `${JSON.stringify({ generator: POSTGRES_EXPORT_GENERATOR })}\n`, { flag: 'wx' })
}

function repositoryDocument(repoKey: string, value: Settings, symbolCount: number): RepositoryDocument {
  const attribution = recordValue(value.default_attribution)
  return {
    id: repoKey,
    repoKey,
    name: stringValue(value.name) ?? repoKey,
    description: stringValue(value.description) ?? '',
    active: true,
    protected: false,
    license: stringValue(attribution.license),
    licenseUrl: stringValue(attribution.license_url),
    author: stringValue(attribution.author_name),
    authorUrl: stringValue(attribution.author_url),
    url: stringValue(value.url),
    symbolCount,
  }
}

async function loadRepositories(client: PoolClient, encryptionKey: string) {
  const rows = await client.query<RepositoryRow>('SELECT id, repo_key, settings FROM symbol_repositories ORDER BY id')
  const all = new Map<string, Settings>()
  const publicRepositories = new Map<string, Settings>()
  for (const row of rows.rows) {
    const value = settings(row.settings, encryptionKey, `repository ${row.repo_key}`)
    all.set(row.repo_key, value)
    if (value.active !== false && value.protected !== true) publicRepositories.set(row.repo_key, value)
  }
  return { all, publicRepositories }
}

async function loadDefaults(client: PoolClient, encryptionKey: string) {
  const rows = await client.query<ModifierRow>(
    'SELECT id, repo_key, locale, settings FROM repository_modifiers ORDER BY id',
  )
  const result = new Map<string, Map<string, string[]>>()
  for (const row of rows.rows) {
    const value = settings(row.settings, encryptionKey, `repository modifier ${row.id}`)
    const locale = normalizeLocale(row.locale || 'en')
    const defaults = recordValue(value.defaults)
    let repo = result.get(row.repo_key)
    if (!repo) {
      repo = new Map()
      result.set(row.repo_key, repo)
    }
    for (const [term, symbolKey] of Object.entries(defaults)) {
      if (typeof symbolKey !== 'string' || !term.trim()) continue
      const key = `${locale}\0${symbolKey}`
      repo.set(key, [...(repo.get(key) ?? []), term.trim().toLowerCase()].sort())
    }
  }
  return result
}

export async function exportPostgresSearchData(options: PostgresExportOptions) {
  if (!/^[A-Za-z0-9._-]+$/.test(options.snapshotId)) throw new Error('snapshot-id contains unsupported characters.')
  const output = resolve(options.outputDirectory)
  await prepareOutput(output, Boolean(options.force))
  const pool = new Pool({ connectionString: options.connectionString, max: 1 })
  const client = await pool.connect()
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    const versionResult = await client.query<{ server_version: string }>('SHOW server_version')
    const { all, publicRepositories } = await loadRepositories(client, options.encryptionKey)
    const defaults = await loadDefaults(client, options.encryptionKey)
    const counts = new Map<string, number>()
    const locales = new Map<string, number>()
    const excluded = { repositories: all.size - publicRepositories.size, disabledSymbols: 0, protectedSymbols: 0, hiddenRepositorySymbols: 0 }
    let symbolCount = 0
    let documentCount = 0
    let minimum: number | null = null
    let maximum: number | null = null
    let lastId = 0

    async function* documents(): AsyncGenerator<SearchDocument> {
      while (true) {
        const result = await client.query<SymbolRow>(
          `SELECT id, repo_key, symbol_key, enabled, has_skin, unsafe_result, settings
           FROM picture_symbols WHERE id > $1 ORDER BY id LIMIT $2`,
          [lastId, options.batchSize ?? 500],
        )
        if (!result.rows.length) break
        for (const row of result.rows) {
          lastId = row.id
          const value = settings(row.settings, options.encryptionKey, `symbol ${row.id}`)
          if (!publicRepositories.has(row.repo_key)) {
            excluded.hiddenRepositorySymbols += 1
            continue
          }
          if (row.enabled === false || value.enabled === false) {
            excluded.disabledSymbols += 1
            continue
          }
          if (value.protected_symbol === true) {
            excluded.protectedSymbols += 1
            continue
          }
          const generated = searchDocumentsForSymbol(
            row, value, defaults.get(row.repo_key) ?? new Map(),
            { bucket: options.s3Bucket, cdn: options.s3Cdn },
          )
          symbolCount += 1
          counts.set(row.repo_key, (counts.get(row.repo_key) ?? 0) + 1)
          minimum = minimum === null ? row.id : Math.min(minimum, row.id)
          maximum = maximum === null ? row.id : Math.max(maximum, row.id)
          for (const document of generated) {
            documentCount += 1
            locales.set(document.locale, (locales.get(document.locale) ?? 0) + 1)
            yield document
          }
        }
      }
    }

    const documentsName = 'documents.jsonl.gz'
    const repositoriesName = 'repositories.jsonl.gz'
    await writeJsonl(join(output, documentsName), documents())
    const repositoryDocuments = [...publicRepositories.entries()]
      .map(([repoKey, value]) => repositoryDocument(repoKey, value, counts.get(repoKey) ?? 0))
      .sort((left, right) => left.repoKey.localeCompare(right.repoKey))
    await writeJsonl(join(output, repositoriesName), repositoryDocuments)
    await client.query('COMMIT')

    const files = {
      repositories: { name: repositoriesName, sha256: await sha256(join(output, repositoriesName)) },
      documents: { name: documentsName, sha256: await sha256(join(output, documentsName)) },
    }
    const stable = {
      generator: POSTGRES_EXPORT_GENERATOR as typeof POSTGRES_EXPORT_GENERATOR,
      schemaVersion: 1 as const,
      snapshotId: options.snapshotId,
      postgresVersion: versionResult.rows[0]?.server_version ?? 'unknown',
      counts: { repositories: repositoryDocuments.length, symbols: symbolCount, documents: documentCount },
      excluded,
      locales: Object.fromEntries([...locales.entries()].sort(([left], [right]) => left.localeCompare(right))),
      symbolIds: { minimum, maximum },
      files,
    }
    const buildHash = createHash('sha256').update(JSON.stringify(stable)).digest('hex')
    const manifest: PostgresExportManifest = { ...stable, buildHash }
    await writeFile(join(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' })
    return { output, manifest }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    if (await owned(output)) await rm(output, { recursive: true })
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}
