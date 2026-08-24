import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './browser-test',
  testMatch: '*.spec.ts',
  use: { baseURL: 'http://127.0.0.1:5183', headless: true },
  webServer: {
    command: 'vite browser-test --host 127.0.0.1 --port 5183',
    url: 'http://127.0.0.1:5183',
    reuseExistingServer: false,
  },
})
