export interface BetaLoadSample {
  route: string
  latencyMs: number
  search: boolean
  error?: string
}

export interface BetaLoadResult {
  requests: number
  errors: number
  errorRate: number
  missingRoutes: string[]
  p50Ms: number
  p95Ms: number
  p99Ms: number
  searchP95Ms: number
  passed: boolean
}

interface BetaLoadOptions {
  baseUrl: string
  durationMs: number
  concurrency: number
  timeoutMs?: number
  fetchImpl?: typeof fetch
}

interface RouteCheck {
  name: string
  path: string
  search: boolean
  validate(body: unknown): void
}

function object(value: unknown): Record<string, unknown> {
  if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('expected an object response')
  return value as Record<string, unknown>
}

function array(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) throw new Error('expected an array response')
  return value.map(object)
}

function publicSymbols(value: unknown) {
  const symbols = array(value)
  if (!symbols.length) throw new Error('expected at least one symbol')
  if (symbols.some((symbol) => symbol.unsafe_result === true)) throw new Error('safe-search filter leak')
  return symbols
}

export const betaLoadRoutes: RouteCheck[] = [
  {
    name: 'health', path: '/api/health', search: false,
    validate(body) {
      if (object(body).status !== 'ok') throw new Error('health response is not ok')
    },
  },
  {
    name: 'search-exact', path: '/api/v1/symbols/search?q=Cup&locale=en&safe=1', search: true,
    validate: publicSymbols,
  },
  {
    name: 'search-typo', path: '/api/v1/symbols/search?q=helllo&locale=en&safe=1', search: true,
    validate: publicSymbols,
  },
  {
    name: 'search-spanish', path: '/api/v1/symbols/search?q=hola&locale=es&safe=1', search: true,
    validate: publicSymbols,
  },
  {
    name: 'search-repository', path: '/api/v1/symbols/search?q=Cup%20repo%3Aarasaac&locale=en&safe=1', search: true,
    validate(body) {
      const symbols = publicSymbols(body)
      if (symbols.some((symbol) => symbol.repo_key !== 'arasaac')) throw new Error('repository filter leak')
    },
  },
  {
    name: 'repository-page', path: '/api/v1/repositories/arasaac/symbols?page=0', search: true,
    validate(body) {
      const symbols = publicSymbols(object(body).symbols)
      if (symbols.some((symbol) => symbol.repo_key !== 'arasaac')) throw new Error('repository page filter leak')
    },
  },
  {
    name: 'random', path: '/api/v1/symbols/random', search: true,
    validate(body) {
      const symbols = publicSymbols(body)
      if (symbols.length !== 9) throw new Error(`expected 9 random symbols, received ${symbols.length}`)
    },
  },
]

export function percentile(values: number[], quantile: number) {
  if (!values.length) return 0
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1)]!
}

export function evaluateBetaLoad(samples: BetaLoadSample[]): BetaLoadResult {
  const requests = samples.length
  const errors = samples.filter((sample) => sample.error).length
  const latencies = samples.map((sample) => sample.latencyMs)
  const searchLatencies = samples.filter((sample) => sample.search).map((sample) => sample.latencyMs)
  const errorRate = requests ? errors / requests : 1
  const searchP95Ms = percentile(searchLatencies, 0.95)
  const successfulRoutes = new Set(samples.filter((sample) => !sample.error).map((sample) => sample.route))
  const missingRoutes = betaLoadRoutes
    .map((route) => route.name)
    .filter((route) => !successfulRoutes.has(route))
  return {
    requests,
    errors,
    errorRate,
    missingRoutes,
    p50Ms: percentile(latencies, 0.5),
    p95Ms: percentile(latencies, 0.95),
    p99Ms: percentile(latencies, 0.99),
    searchP95Ms,
    passed: requests > 0 && missingRoutes.length === 0 && errorRate < 0.01 && searchP95Ms < 500,
  }
}

export async function runBetaLoad(options: BetaLoadOptions) {
  if (!Number.isSafeInteger(options.durationMs) || options.durationMs < 1) throw new Error('durationMs must be positive')
  if (!Number.isSafeInteger(options.concurrency) || options.concurrency < 1) throw new Error('concurrency must be positive')
  const baseUrl = new URL(options.baseUrl)
  if (baseUrl.protocol !== 'https:') throw new Error('beta load tests require an HTTPS origin')
  const fetchImpl = options.fetchImpl ?? fetch
  const timeoutMs = options.timeoutMs ?? 15_000
  const samples: BetaLoadSample[] = []
  const deadline = Date.now() + options.durationMs

  const sampleRoute = async (route: RouteCheck) => {
    const started = performance.now()
    let error: string | undefined
    try {
      const response = await fetchImpl(new URL(route.path, baseUrl), { signal: AbortSignal.timeout(timeoutMs) })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      route.validate(await response.json())
    } catch (caught) {
      error = caught instanceof Error ? caught.message : 'unknown request failure'
    }
    samples.push({ route: route.name, latencyMs: performance.now() - started, search: route.search, error })
  }

  // Guarantee that even a deliberately short run exercises every acceptance
  // route. The evaluator still requires a successful sample for each route.
  await Promise.all(betaLoadRoutes.map(sampleRoute))

  await Promise.all(Array.from({ length: options.concurrency }, async (_, worker) => {
    let requestNumber = worker
    while (Date.now() < deadline) {
      const route = betaLoadRoutes[requestNumber % betaLoadRoutes.length]!
      await sampleRoute(route)
      requestNumber += options.concurrency
    }
  }))
  return { samples, result: evaluateBetaLoad(samples) }
}
