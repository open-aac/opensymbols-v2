import { runBetaLoad } from './beta-load.js'

function positiveInteger(value: string | undefined, fallback: number, name: string) {
  const parsed = Number.parseInt(value ?? String(fallback), 10)
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer`)
  return parsed
}

const baseUrl = process.env.BETA_BASE_URL?.trim()
if (!baseUrl) throw new Error('BETA_BASE_URL is required')

const { samples, result } = await runBetaLoad({
  baseUrl,
  durationMs: positiveInteger(process.env.BETA_LOAD_DURATION_MS, 600_000, 'BETA_LOAD_DURATION_MS'),
  concurrency: positiveInteger(process.env.BETA_LOAD_CONCURRENCY, 20, 'BETA_LOAD_CONCURRENCY'),
  timeoutMs: positiveInteger(process.env.BETA_LOAD_TIMEOUT_MS, 15_000, 'BETA_LOAD_TIMEOUT_MS'),
})

const failuresByRoute = new Map<string, typeof samples>()
for (const sample of samples) {
  if (!sample.error) continue
  const routeSamples = failuresByRoute.get(sample.route) ?? []
  routeSamples.push(sample)
  failuresByRoute.set(sample.route, routeSamples)
}
const failures = [...failuresByRoute].map(([route, routeSamples]) => ({
  route,
  errors: routeSamples.length,
  example: routeSamples[0]?.error,
}))

console.log(JSON.stringify({ ...result, failures }, null, 2))
if (!result.passed) process.exitCode = 1
