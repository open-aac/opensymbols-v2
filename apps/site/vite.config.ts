import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const serverTarget = process.env.VITE_SERVER_PROXY_TARGET ?? 'http://localhost:3000'

export default defineConfig({
  plugins: [react()],
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
})
