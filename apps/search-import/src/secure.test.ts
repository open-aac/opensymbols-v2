import { describe, expect, it } from 'vitest'
import { decodeGoSecure, GoSecureDecodeError, objectValue } from './secure.js'

const encrypted = 'MDEyMzQ1Njc4OWFiY2RlZg==\n--PZm7tM0qFdL5+PaQ4v8e9K3OTD/6f8U0dr1W+NQ+QgE=\n'

describe('search importer GoSecure decoding', () => {
  it('reads marker and plain object values', () => {
    expect(objectValue(decodeGoSecure('**{"name":"hello"}'))).toEqual({ name: 'hello' })
    expect(objectValue(decodeGoSecure(' {"name":"hello"}'))).toEqual({ name: 'hello' })
  })

  it('rejects encrypted data without the matching key', () => {
    expect(() => decodeGoSecure(encrypted)).toThrow(GoSecureDecodeError)
    expect(() => decodeGoSecure(encrypted, 'wrong')).toThrow(GoSecureDecodeError)
  })
})
