import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveServerProxyTarget } from './vite-environment'

const temporaryDirectories: string[] = []
let originalServerProxyTarget: string | undefined

async function createEnvironmentDirectory(files: Record<string, string> = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'opensymbols-vite-environment-'))
  temporaryDirectories.push(directory)

  await Promise.all(Object.entries(files).map(([name, contents]) =>
    writeFile(join(directory, name), contents),
  ))

  return directory
}

beforeEach(() => {
  originalServerProxyTarget = process.env.VITE_SERVER_PROXY_TARGET
  delete process.env.VITE_SERVER_PROXY_TARGET
})

afterEach(async () => {
  if (originalServerProxyTarget === undefined) {
    delete process.env.VITE_SERVER_PROXY_TARGET
  } else {
    process.env.VITE_SERVER_PROXY_TARGET = originalServerProxyTarget
  }

  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true }),
  ))
})

describe('Vite server proxy target', () => {
  it('loads the target from root and mode-specific environment files', async () => {
    const environmentDirectory = await createEnvironmentDirectory({
      '.env': 'VITE_SERVER_PROXY_TARGET=http://localhost:3001\n',
      '.env.development': 'VITE_SERVER_PROXY_TARGET=http://localhost:3002\n',
    })

    expect(resolveServerProxyTarget({
      mode: 'development',
      environmentDirectory,
      processEnvironment: {},
    })).toBe('http://localhost:3002')
  })

  it('prefers an explicit process environment value', async () => {
    const environmentDirectory = await createEnvironmentDirectory({
      '.env': 'VITE_SERVER_PROXY_TARGET=http://localhost:3001\n',
    })

    expect(resolveServerProxyTarget({
      mode: 'development',
      environmentDirectory,
      processEnvironment: { VITE_SERVER_PROXY_TARGET: 'http://localhost:3003' },
    })).toBe('http://localhost:3003')
  })

  it('retains the existing default when no override is configured', async () => {
    const environmentDirectory = await createEnvironmentDirectory()

    expect(resolveServerProxyTarget({
      mode: 'development',
      environmentDirectory,
      processEnvironment: {},
    })).toBe('http://localhost:3000')
  })
})
