import { defineConfig } from '@playwright/test'

// Si PLAYWRIGHT_CHROMIUM_PATH está definida se usa ese Chromium; si no,
// Playwright usa su navegador por defecto (el que baja `playwright install`).
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined

// Los 4 viewports del brief. El mapa completo no se prueba en teléfono (allí van
// la búsqueda y la ubicación en texto).
export const VIEWPORTS = {
  'desktop-1440x900': { width: 1440, height: 900 },
  'laptop-1280x800': { width: 1280, height: 800 },
  'tablet-1024x768': { width: 1024, height: 768 },
  'telefono-390x844': { width: 390, height: 844 },
} as const

const PUERTO = Number(process.env.WMS_E2E_PUERTO ?? 3100)

export default defineConfig({
  testDir: './e2e',
  // El modo demostración guarda su estado en memoria del servidor: pruebas en serie.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 45_000,
  reporter: [['list'], ['json', { outputFile: 'test-results/resultado.json' }]],
  use: {
    baseURL: `http://localhost:${PUERTO}`,
    launchOptions: { executablePath },
    locale: 'es-PE',
    timezoneId: 'America/Lima',
  },
  projects: Object.entries(VIEWPORTS).map(([name, viewport]) => ({
    name,
    use: { viewport, hasTouch: name.startsWith('telefono'), deviceScaleFactor: 1 },
  })),
  // Requiere `npm run build --workspace erp-logisalud-wms` antes (o reutiliza un servidor ya levantado).
  webServer: {
    command: `npx next start -p ${PUERTO}`,
    url: `http://localhost:${PUERTO}/wms/login`,
    reuseExistingServer: true,
    timeout: 60_000,
    env: { WMS_DEMO_LOCAL: '1', PORT: String(PUERTO) },
  },
})
