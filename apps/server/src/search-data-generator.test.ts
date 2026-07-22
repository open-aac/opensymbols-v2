import { createGunzip } from 'node:zlib'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Readable } from 'node:stream'
import { Ajv2020 } from 'ajv/dist/2020.js'
import { afterEach, describe, expect, it } from 'vitest'
import { generateSearchData, GENERATOR_ID, REPOSITORY_ROOT } from './search-data-generator.js'

const temporaryDirectories: string[] = []

async function temporaryDirectory() {
  const path = await mkdtemp(join(tmpdir(), 'opensymbols-search-data-'))
  temporaryDirectories.push(path)
  return path
}

async function jsonl(path: string, compressed = true) {
  const bytes = await readFile(path)
  const stream = compressed ? Readable.from(bytes).pipe(createGunzip()) : Readable.from(bytes)
  let text = ''
  for await (const chunk of stream) text += chunk.toString()
  return text.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>)
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

describe('search benchmark data generator', () => {
  it('reproduces the committed golden corpus byte for byte', async () => {
    const golden = JSON.parse(await readFile(new URL('./test-fixtures/search-benchmark-golden.json', import.meta.url), 'utf8')) as { counts: Record<string, number>; hashes: Record<string, string> }
    const root = await temporaryDirectory()
    const first = await generateSearchData({ preset: 'relevance', seed: 42, compression: 'gzip', output: join(root, 'first') })
    const second = await generateSearchData({ preset: 'relevance', seed: 42, compression: 'gzip', output: join(root, 'second') })

    expect(first.manifest.counts).toEqual(golden.counts)
    expect(first.manifest.hashes).toEqual(golden.hashes)
    expect(second.manifest.hashes).toEqual(first.manifest.hashes)
  })

  it('changes the run identity for another seed while preserving the curated records', async () => {
    const root = await temporaryDirectory()
    const first = await generateSearchData({ preset: 'relevance', seed: 42, compression: 'none', output: join(root, 'first') })
    const second = await generateSearchData({ preset: 'relevance', seed: 99, compression: 'none', output: join(root, 'second') })
    expect(second.manifest.seed).not.toBe(first.manifest.seed)
    expect(await readFile(join(first.output, 'symbols.jsonl'), 'utf8')).toBe(await readFile(join(second.output, 'symbols.jsonl'), 'utf8'))
  })

  it('produces valid, connected records with multilingual and boundary cases', async () => {
    const root = await temporaryDirectory()
    const result = await generateSearchData({ preset: 'relevance', seed: 42, compression: 'gzip', output: join(root, 'data') })
    const repositories = await jsonl(join(result.output, 'repositories.jsonl.gz'))
    const symbols = await jsonl(join(result.output, 'symbols.jsonl.gz'))
    const localizations = await jsonl(join(result.output, 'localizations.jsonl.gz'))
    const judgments = await jsonl(join(result.output, 'judgments.jsonl.gz'))
    const schemaDirectory = resolve(REPOSITORY_ROOT, 'contracts/search-benchmark/v1')
    const schemas = await Promise.all(['repository', 'symbol', 'localization', 'judgment'].map(async (name) => JSON.parse(await readFile(join(schemaDirectory, `${name}.schema.json`), 'utf8'))))
    const ajv = new Ajv2020({ allErrors: true, strict: true, validateFormats: false })
    for (const [records, schema] of [[repositories, schemas[0]], [symbols, schemas[1]], [localizations, schemas[2]], [judgments, schemas[3]]] as const) {
      const validate = ajv.compile(schema)
      for (const record of records) expect(validate(record), JSON.stringify(validate.errors)).toBe(true)
    }

    expect(new Set(repositories.map((record) => record.repoKey)).size).toBe(24)
    expect(new Set(symbols.map((record) => record.id)).size).toBe(200)
    expect(localizations.some((record) => record.locale === 'ar' && String(record.name).includes('مرحبا'))).toBe(true)
    expect(localizations.some((record) => record.locale === 'zh-CN' && record.name === '你好')).toBe(true)
    expect(symbols.some((record) => record.unsafe)).toBe(true)
    expect(symbols.some((record) => record.protected)).toBe(true)
    expect(symbols.some((record) => !record.enabled)).toBe(true)
    const symbolIds = new Set(symbols.map((record) => record.id))
    expect(localizations.every((record) => symbolIds.has(record.symbolId))).toBe(true)
    expect(judgments).toHaveLength(150)
    expect(judgments.every((record) => (record.expected as Array<{ symbolId: number }>).every((expected) => symbolIds.has(expected.symbolId)))).toBe(true)
  })

  it('guards replacement and cleans a failed staging directory', async () => {
    const root = await temporaryDirectory()
    const foreign = join(root, 'foreign')
    await mkdir(foreign)
    await writeFile(join(foreign, 'keep.txt'), 'user data')
    await expect(generateSearchData({ preset: 'relevance', seed: 42, compression: 'none', output: foreign, force: true })).rejects.toThrow('not replaceable')
    expect(await readFile(join(foreign, 'keep.txt'), 'utf8')).toBe('user data')

    const failed = join(root, 'failed')
    await expect(generateSearchData({ preset: 'relevance', seed: 42, compression: 'none', output: failed, corePath: join(root, 'missing.json') })).rejects.toThrow()
    expect((await readdir(root)).some((name) => name.startsWith('failed.partial-'))).toBe(false)
  })

  it('rejects invalid generator options before creating output', async () => {
    const root = await temporaryDirectory()
    await expect(generateSearchData({ preset: 'unknown' as 'relevance', seed: 42, compression: 'none', output: join(root, 'preset') })).rejects.toThrow('Unknown dataset preset')
    await expect(generateSearchData({ preset: 'relevance', seed: Number.NaN, compression: 'none', output: join(root, 'seed') })).rejects.toThrow('safe integer')
    await expect(generateSearchData({ preset: 'relevance', seed: 42, compression: 'zip' as 'gzip', output: join(root, 'compression') })).rejects.toThrow('Compression must')
  })

  it('allows guarded replacement of its own completed output', async () => {
    const root = await temporaryDirectory()
    const output = join(root, 'data')
    await generateSearchData({ preset: 'relevance', seed: 42, compression: 'none', output })
    const result = await generateSearchData({ preset: 'relevance', seed: 42, compression: 'none', output, force: true })
    const manifest = JSON.parse(await readFile(join(result.output, 'manifest.json'), 'utf8')) as { generator: string }
    expect(manifest.generator).toBe(GENERATOR_ID)
  })
})
