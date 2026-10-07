import { defineConfig, devices } from '@playwright/test'

// Si PLAYWRIGHT_CHROMIUM_PATH está definida se usa ese Chromium; si no,
// Playwright usa su navegador por defecto (el que baja `playwright install`).
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined

export default defineConfig({
  testDir: './e2e',
  use: {
    ...devices['Desktop Chrome'],
    launchOptions: { executablePath },
  },
})
