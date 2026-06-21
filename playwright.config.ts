import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  fullyParallel: false, // Electron 实例不并行
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    actionTimeout: 10_000,
    trace: 'retain-on-failure'
  }
})
