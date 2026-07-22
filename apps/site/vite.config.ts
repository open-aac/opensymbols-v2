import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
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
    plugins: [tailwindcss(), react()],
    envDir: environmentDirectory,
    server: {
      proxy: {
        '/api/': serverTarget,
      },
    },
    test: {
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
    },
  }
})
