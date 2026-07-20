import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'
import { resolveServerProxyTarget } from './vite-environment'

const environmentDirectory = fileURLToPath(new URL('../..', import.meta.url))

export default defineConfig(({ mode }) => {
  const serverTarget = resolveServerProxyTarget({
    mode,
    environmentDirectory,
    processEnvironment: process.env,
  })

  return {
    plugins: [react()],
    envDir: environmentDirectory,
    server: {
      proxy: {
        '/api/': serverTarget,
        '/admin': serverTarget,
        '/auth': serverTarget,
        '/login': serverTarget,
        '/stats': serverTarget,
      },
    },
    test: {
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
    },
  }
})
