import { describe, expect, it, vi } from 'vitest'
import { betaLoadRoutes, evaluateBetaLoad, percentile, runBetaLoad } from './beta-load.js'

function successfulRouteSamples() {
  return betaLoadRoutes.map((route) => ({
    route: route.name,
    latencyMs: 120,
    search: route.search,
  }))
}

describe('beta load verification', () => {
  it('calculates nearest-rank latency percentiles', () => {
    expect(percentile([40, 10, 30, 20], 0.5)).toBe(20)
    expect(percentile([40, 10, 30, 20], 0.95)).toBe(40)
    expect(percentile([], 0.95)).toBe(0)
  })

  it('enforces the error-rate and search-p95 acceptance thresholds', () => {
    expect(evaluateBetaLoad(successfulRouteSamples()).passed).toBe(true)
    expect(evaluateBetaLoad(successfulRouteSamples().map((sample) => ({
      ...sample,
      latencyMs: sample.search ? 500 : sample.latencyMs,
    }))).passed).toBe(false)
    expect(evaluateBetaLoad([
      ...successfulRouteSamples(),
      ...Array.from({ length: 93 }, (_, index) => ({
        route: 'search-exact', latencyMs: 120, search: true, ...(index === 0 ? { error: 'HTTP 503' } : {}),
      })),
    ]).passed).toBe(false)
  })

  it('rejects a sample set without successful coverage for every route', () => {
    const incomplete = successfulRouteSamples().filter((sample) => sample.route !== 'search-repository')
    expect(evaluateBetaLoad(incomplete)).toMatchObject({
      passed: false,
      missingRoutes: ['search-repository'],
    })

    const failedRoute = successfulRouteSamples().map((sample) => (
      sample.route === 'random' ? { ...sample, error: 'HTTP 503' } : sample
    ))
    expect(evaluateBetaLoad(failedRoute).missingRoutes).toEqual(['random'])
  })

  it('attempts every acceptance route even when the configured duration is short', async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url)
      if (url.pathname === '/api/health') return Response.json({ status: 'ok' })
      if (url.pathname.endsWith('/repositories/arasaac/symbols')) {
        return Response.json({ symbols: [{ unsafe_result: false, repo_key: 'arasaac' }] })
      }
      if (url.pathname.endsWith('/random')) {
        return Response.json(Array.from({ length: 9 }, () => ({ unsafe_result: false })))
      }
      return Response.json([{ unsafe_result: false, repo_key: 'arasaac' }])
    })

    const { samples, result } = await runBetaLoad({
      baseUrl: 'https://beta.opensymbols.org',
      durationMs: 1,
      concurrency: 1,
      fetchImpl: fetchImpl as typeof fetch,
    })

    expect(new Set(samples.map((sample) => sample.route))).toEqual(
      new Set(betaLoadRoutes.map((route) => route.name)),
    )
    expect(result.missingRoutes).toEqual([])
    expect(result.passed).toBe(true)
  })

  it('rejects safe-search and repository filter leaks', () => {
    const safeSearch = betaLoadRoutes.find((route) => route.name === 'search-exact')!
    const repositorySearch = betaLoadRoutes.find((route) => route.name === 'search-repository')!
    expect(() => safeSearch.validate([{ unsafe_result: true }])).toThrow('safe-search filter leak')
    expect(() => repositorySearch.validate([{ unsafe_result: false, repo_key: 'other' }]))
      .toThrow('repository filter leak')
  })
})
