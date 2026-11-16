import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'apps/__tests__',
  workers: 1,
  timeout: 10 * 60_000,
  webServer: {
    command: 'pnpm --filter client build && pnpm dev --pwa',
    wait: {
      stdout:
        /offsite is running at http:\/\/127\.0\.0\.1:(?<OFFSITE_E2E_PORT>\d+)/,
    },
    timeout: 10 * 60_000,
  },
})
