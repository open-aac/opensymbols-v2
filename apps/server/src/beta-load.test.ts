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

  it('starts the measured duration after a slow bootstrap and excludes bootstrap metrics', async () => {
    let clock = 0
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      clock += 10
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

    const { bootstrapSamples, samples, result } = await runBetaLoad({
      baseUrl: 'https://beta.opensymbols.org',
      durationMs: 30,
      concurrency: 1,
      fetchImpl: fetchImpl as typeof fetch,
      now: () => clock,
    })

    expect(bootstrapSamples).toHaveLength(betaLoadRoutes.length)
    expect(samples).toHaveLength(3)
    expect(result.requests).toBe(3)
    expect(result.missingRoutes.length).toBeGreaterThan(0)
    expect(result.passed).toBe(false)
  })

  it('stops after bootstrap failure and reports it separately', async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url)
      if (url.pathname === '/api/health') return new Response(null, { status: 503 })
      if (url.pathname.endsWith('/repositories/arasaac/symbols')) {
        return Response.json({ symbols: [{ unsafe_result: false, repo_key: 'arasaac' }] })
      }
      if (url.pathname.endsWith('/random')) {
        return Response.json(Array.from({ length: 9 }, () => ({ unsafe_result: false })))
      }
      return Response.json([{ unsafe_result: false, repo_key: 'arasaac' }])
    })

    const { bootstrapSamples, samples, result } = await runBetaLoad({
      baseUrl: 'https://beta.opensymbols.org',
      durationMs: 600_000,
      concurrency: 20,
      fetchImpl: fetchImpl as typeof fetch,
    })

    expect(bootstrapSamples).toHaveLength(betaLoadRoutes.length)
    expect(samples).toEqual([])
    expect(result.requests).toBe(0)
    expect(result.bootstrapFailures).toEqual([{ route: 'health', error: 'HTTP 503' }])
    expect(result.passed).toBe(false)
  })

  it('rejects safe-search and repository filter leaks', () => {
    const safeSearch = betaLoadRoutes.find((route) => route.name === 'search-exact')!
    const repositorySearch = betaLoadRoutes.find((route) => route.name === 'search-repository')!
    expect(() => safeSearch.validate([{ unsafe_result: true }])).toThrow('safe-search filter leak')
    expect(() => repositorySearch.validate([{ unsafe_result: false, repo_key: 'other' }]))
      .toThrow('repository filter leak')
  })
})
