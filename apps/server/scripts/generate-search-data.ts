import { resolve } from 'node:path'
import { generateSearchData, PRESET_COUNTS, REPOSITORY_ROOT, type Compression, type Preset } from '../src/search-data-generator.js'

function valueAfter(args: string[], name: string) {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}

const args = process.argv.slice(2)
const preset = valueAfter(args, '--preset') as Preset | undefined
if (!preset || !(preset in PRESET_COUNTS)) throw new Error('Use --preset relevance|100k|500k|1m.')
const seedText = valueAfter(args, '--seed') ?? '42'
const seed = Number(seedText)
if (!Number.isSafeInteger(seed)) throw new Error('--seed must be a safe integer.')
const compression = (valueAfter(args, '--compression') ?? 'gzip') as Compression
if (!['gzip', 'none'].includes(compression)) throw new Error('--compression must be gzip or none.')
const requestedOutput = valueAfter(args, '--output') ?? `.benchmark-data/${preset}-seed-${seed}`
const output = resolve(REPOSITORY_ROOT, requestedOutput)
const result = await generateSearchData({ preset, seed, compression, output, force: args.includes('--force') })
process.stdout.write(`${JSON.stringify({ output: result.output, counts: result.manifest.counts, durationMs: result.durationMs, outputBytes: result.outputBytes, peakRssBytes: result.peakRssBytes }, null, 2)}\n`)
