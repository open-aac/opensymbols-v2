import { describe, expect, it } from 'vitest'
import { databaseUrlFromEnvironment } from './database-config.js'

describe('databaseUrlFromEnvironment', () => {
  it('uses an explicit database URL unchanged', () => {
    expect(databaseUrlFromEnvironment({ DATABASE_URL: 'postgresql://database.example/open' }))
      .toBe('postgresql://database.example/open')
  })

  it('builds the loopback development URL from local defaults', () => {
    expect(databaseUrlFromEnvironment({})).toBe(
      'postgresql://opensymbols:opensymbols@127.0.0.1:5432/opensymbols_development',
    )
  })

  it('encodes credentials and accepts a configurable loopback port', () => {
    expect(databaseUrlFromEnvironment({
      POSTGRES_USER: 'open user',
      POSTGRES_PASSWORD: 'a/b',
      POSTGRES_DB: 'open symbols',
      POSTGRES_PORT: '5544',
    })).toBe('postgresql://open%20user:a%2Fb@127.0.0.1:5544/open%20symbols')
  })

  it.each(['0', '65536', 'not-a-port'])('rejects invalid PostgreSQL port %s', (port) => {
    expect(() => databaseUrlFromEnvironment({ POSTGRES_PORT: port })).toThrow(
      'POSTGRES_PORT must be an integer between 1 and 65535',
    )
  })
})
