import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'tests',
  outputDir: 'output/results',
  reporter: [
    ['list'],
    ['html', { outputFolder: 'output/report', open: 'never' }],
  ],
  workers: 1,
  timeout: 240_000,
  use: {
    ignoreHTTPSErrors: true,
    viewport: { width: 1600, height: 1000 },
    actionTimeout: 15_000,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'devbox', testMatch: /devbox\.setup\.mts/ },
    { name: 'direct', dependencies: ['devbox'] },
    { name: 'https', dependencies: ['devbox'] },
    { name: 'tunnel', dependencies: ['devbox'] },
  ],
})
