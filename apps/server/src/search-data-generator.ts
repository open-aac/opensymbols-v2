import { createHash } from 'node:crypto'
import { once } from 'node:events'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, readFile, rename, rm, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { finished } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { createGzip } from 'node:zlib'

export const GENERATOR_ID = 'opensymbols-search-benchmark-v1'
export const REPOSITORY_ROOT = fileURLToPath(new URL('../../../', import.meta.url))
export const PRESET_COUNTS = { relevance: 200, '100k': 100_000, '500k': 500_000, '1m': 1_000_000 } as const
export type Preset = keyof typeof PRESET_COUNTS
export type Compression = 'gzip' | 'none'

type CoreConcept = {
  key: string
  en: [string, string, string, string]
  es: string
  fr: string
  de: string
  ar: string
  zh: string
}
type Locale = 'en' | 'es' | 'fr' | 'de' | 'ar' | 'zh-CN'

export interface GenerateOptions {
  preset: Preset
  seed: number
  output: string
  compression: Compression
  force?: boolean
  corePath?: string
}

const localeConfig = [
  ['es', 30], ['fr', 25], ['de', 20], ['ar', 15], ['zh-CN', 15],
] as const
const repositoryKeys = ['core-aac', ...Array.from({ length: 23 }, (_, index) => `synthetic-${String(index + 1).padStart(2, '0')}`)]
const attribution = { license: 'CC0-1.0', author: 'OpenSymbols synthetic benchmark' }

function mix(seed: number, value: number, salt: number) {
  let result = (seed ^ Math.imul(value, 0x9e3779b1) ^ salt) >>> 0
  result = Math.imul(result ^ (result >>> 16), 0x85ebca6b) >>> 0
  result = Math.imul(result ^ (result >>> 13), 0xc2b2ae35) >>> 0
  return (result ^ (result >>> 16)) >>> 0
}

function syntheticText(seed: number, id: number) {
  const actions = ['ask', 'bring', 'choose', 'find', 'give', 'make', 'open', 'play', 'put', 'show', 'take', 'use']
  const objects = ['apple', 'bag', 'book', 'chair', 'coat', 'cup', 'door', 'game', 'light', 'music', 'phone', 'room', 'shoe', 'table', 'water', 'window']
  const contexts = ['at home', 'at school', 'for communication', 'for daily living', 'for play', 'with another person']
  const action = actions[mix(seed, id, 1) % actions.length]!
  const object = objects[mix(seed, id, 2) % objects.length]!
  const context = contexts[mix(seed, id, 3) % contexts.length]!
  return { name: `${action} ${object} ${id}`, description: `A synthetic symbol to ${action} the ${object} ${context}.`, synonyms: [object, `${action} ${object}`] }
}

function typo(value: string) {
  if (value.length < 4) return `${value}x`
  return `${value.slice(0, 1)}${value[2]}${value[1]}${value.slice(3)}`
}

async function defaultCorePath() {
  return resolve(REPOSITORY_ROOT, 'contracts/search-benchmark/v1/core.json')
}

async function readCore(path?: string) {
  const concepts = JSON.parse(await readFile(path ?? await defaultCorePath(), 'utf8')) as CoreConcept[]
  if (concepts.length !== 25) throw new Error('The curated core must contain exactly 25 concepts.')
  return concepts
}

async function canReplace(output: string) {
  try {
    const manifest = JSON.parse(await readFile(join(output, 'manifest.json'), 'utf8')) as { generator?: string }
    return manifest.generator === GENERATOR_ID
  } catch {
    return false
  }
}

async function hashFile(path: string) {
  const hash = createHash('sha256')
  const input = createReadStream(path)
  input.on('data', (chunk) => hash.update(chunk))
  await finished(input)
  return hash.digest('hex')
}

async function createJsonlWriter(path: string, compression: Compression) {
  const file = createWriteStream(path, { flags: 'wx' })
  const writable = compression === 'gzip' ? createGzip({ level: 9 }) : file
  if (compression === 'gzip') writable.pipe(file)
  return {
    async write(value: unknown) {
      if (!writable.write(`${JSON.stringify(value)}\n`)) {
        await once(writable, 'drain')
      }
    },
    async close() {
      writable.end()
      await finished(file)
    },
  }
}

export async function generateSearchData(options: GenerateOptions) {
  const started = performance.now()
  if (!(options.preset in PRESET_COUNTS)) throw new Error('Unknown dataset preset.')
  if (!['gzip', 'none'].includes(options.compression)) throw new Error('Compression must be gzip or none.')
  const count = PRESET_COUNTS[options.preset]
  if (!Number.isSafeInteger(options.seed)) throw new Error('Seed must be a safe integer.')
  const output = resolve(options.output)
  try {
    await stat(output)
    if (!options.force || !(await canReplace(output))) {
      throw new Error(`Output directory already exists and is not replaceable: ${output}`)
    }
    await rm(output, { recursive: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT' && !(error instanceof Error && error.message.startsWith('Output directory'))) throw error
    if (error instanceof Error && error.message.startsWith('Output directory')) throw error
  }

  await mkdir(dirname(output), { recursive: true })
  const staging = `${output}.partial-${process.pid}`
  await rm(staging, { recursive: true, force: true })
  await mkdir(staging)
  const extension = options.compression === 'gzip' ? '.jsonl.gz' : '.jsonl'
  const paths = Object.fromEntries(['repositories', 'symbols', 'localizations', 'judgments'].map((name) => [name, join(staging, `${name}${extension}`)]))
  const localeCounts: Record<Locale, number> = { en: 0, es: 0, fr: 0, de: 0, ar: 0, 'zh-CN': 0 }

  try {
    const concepts = await readCore(options.corePath)
    const repositoryWriter = await createJsonlWriter(paths.repositories!, options.compression)
    for (let index = 0; index < repositoryKeys.length; index += 1) {
      await repositoryWriter.write({
        repoKey: repositoryKeys[index],
        name: index === 0 ? 'Curated AAC Core' : `Synthetic Repository ${index}`,
        description: 'Deterministic benchmark data; not a real symbol repository.',
        active: index !== 23,
        protected: index === 22,
        attribution,
      })
    }
    await repositoryWriter.close()

    const symbolWriter = await createJsonlWriter(paths.symbols!, options.compression)
    const localizationWriter = await createJsonlWriter(paths.localizations!, options.compression)
    for (let id = 1; id <= count; id += 1) {
      const curated = id <= 200
      const concept = curated ? concepts[Math.floor((id - 1) / 8)]! : undefined
      const variant = curated ? (id - 1) % 8 : 0
      const text = concept
        ? { name: variant === 0 ? concept.en[0] : `${concept.en[0]} ${variant + 1}`, description: concept.en[1], synonyms: concept.en.slice(2) }
        : syntheticText(options.seed, id)
      const repoIndex = curated ? 0 : Math.min(23, Math.floor(Math.sqrt((mix(options.seed, id, 4) + 1) / 0x1_0000_0000) * 24))
      const unsafe = curated ? id === 72 : mix(options.seed, id, 5) % 100 < 2
      const protectedSymbol = curated ? id === 73 : mix(options.seed, id, 6) % 100 < 1
      const enabled = curated ? id !== 74 : mix(options.seed, id, 7) % 100 >= 1
      await symbolWriter.write({
        id,
        repoKey: repositoryKeys[repoIndex],
        symbolKey: `symbol-${String(id).padStart(7, '0')}`,
        imageUrl: `https://assets.example.invalid/symbols/${String(id).padStart(7, '0')}.svg`,
        enabled,
        protected: protectedSymbol,
        unsafe,
        hasSkin: curated ? id === 1 : mix(options.seed, id, 8) % 100 < 12,
        hasVariants: curated ? id === 1 : mix(options.seed, id, 9) % 100 < 8,
        attribution,
      })
      await localizationWriter.write({ symbolId: id, locale: 'en', name: text.name, description: text.description, searchTerms: [text.name.toLowerCase(), ...text.synonyms], synonyms: text.synonyms, keywordBoosts: { [text.name.toLowerCase()]: 2 } })
      localeCounts.en += 1
      for (const [locale, coverage] of localeConfig) {
        if (!curated && mix(options.seed, id, locale.charCodeAt(0)) % 100 >= coverage) continue
        const translated = concept ? concept[locale === 'zh-CN' ? 'zh' : locale] : `${text.name} ${locale}`
        await localizationWriter.write({ symbolId: id, locale, name: variant && concept ? `${translated} ${variant + 1}` : translated, description: text.description, searchTerms: [translated.toLowerCase(), ...text.synonyms], synonyms: text.synonyms, keywordBoosts: { [translated.toLowerCase()]: 2 } })
        localeCounts[locale] += 1
      }
    }
    await symbolWriter.close()
    await localizationWriter.close()

    const judgmentWriter = await createJsonlWriter(paths.judgments!, options.compression)
    const otherLocales = ['fr', 'de', 'ar', 'zh-CN'] as const
    let judgmentCount = 0
    for (let index = 0; index < concepts.length; index += 1) {
      const concept = concepts[index]!
      const symbolId = index * 8 + 1
      const cases = [
        ['exact', concept.en[0], 'en'],
        ['prefix', concept.en[0].slice(0, Math.max(2, Math.ceil(concept.en[0].length / 2))), 'en'],
        ['typo', typo(concept.en[0].toLowerCase()), 'en'],
        ['intent', concept.en[1], 'en'],
        ['multilingual', concept.es, 'es'],
        ['filter', (() => {
          const locale = otherLocales[index % otherLocales.length]!
          return concept[locale === 'zh-CN' ? 'zh' : locale]
        })(), otherLocales[index % otherLocales.length]],
      ] as const
      for (const [category, query, locale] of cases) {
        judgmentCount += 1
        await judgmentWriter.write({ id: `query-${String(judgmentCount).padStart(3, '0')}`, category, query, locale, filters: { safe: true, ...(category === 'filter' ? { repoKey: 'core-aac' } : {}) }, expected: [{ symbolId, grade: 3 }] })
      }
    }
    await judgmentWriter.close()

    const hashes: Record<string, string> = {}
    for (const [name, path] of Object.entries(paths)) hashes[name] = await hashFile(path)
    const manifest = {
      generator: GENERATOR_ID,
      schemaVersion: 1,
      preset: options.preset,
      seed: options.seed,
      compression: options.compression,
      counts: { repositories: 24, symbols: count, localizations: Object.values(localeCounts).reduce((sum, value) => sum + value, 0), judgments: judgmentCount },
      localeCounts,
      hashes,
    }
    await import('node:fs/promises').then(({ writeFile }) => writeFile(join(staging, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' }))
    const outputBytes = (await Promise.all(Object.values(paths).map(async (path) => (await stat(path)).size))).reduce((sum, size) => sum + size, 0)
    await rename(staging, output)
    return { output, manifest, durationMs: Math.round(performance.now() - started), peakRssBytes: process.resourceUsage().maxRSS * 1024, outputBytes }
  } catch (error) {
    await rm(staging, { recursive: true, force: true })
    throw error
  }
}
