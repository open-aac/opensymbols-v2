import { describe, expect, it } from 'vitest'
import { betaLoadRoutes, evaluateBetaLoad, percentile } from './beta-load.js'

describe('beta load verification', () => {
  it('calculates nearest-rank latency percentiles', () => {
    expect(percentile([40, 10, 30, 20], 0.5)).toBe(20)
    expect(percentile([40, 10, 30, 20], 0.95)).toBe(40)
    expect(percentile([], 0.95)).toBe(0)
  })

  it('enforces the error-rate and search-p95 acceptance thresholds', () => {
    expect(evaluateBetaLoad(Array.from({ length: 101 }, () => ({
      route: 'search', latencyMs: 120, search: true,
    }))).passed).toBe(true)
    expect(evaluateBetaLoad([
      { route: 'search', latencyMs: 500, search: true },
    ]).passed).toBe(false)
    expect(evaluateBetaLoad(Array.from({ length: 100 }, (_, index) => ({
      route: 'search', latencyMs: 120, search: true, ...(index === 0 ? { error: 'HTTP 503' } : {}),
    }))).passed).toBe(false)
  })

  it('rejects safe-search and repository filter leaks', () => {
    const safeSearch = betaLoadRoutes.find((route) => route.name === 'search-exact')!
    const repositorySearch = betaLoadRoutes.find((route) => route.name === 'search-repository')!
    expect(() => safeSearch.validate([{ unsafe_result: true }])).toThrow('safe-search filter leak')
    expect(() => repositorySearch.validate([{ unsafe_result: false, repo_key: 'other' }]))
      .toThrow('repository filter leak')
  })
})
