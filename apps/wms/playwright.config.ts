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

// Tres modos (los fija scripts/e2e-por-viewport.sh; sin él, `principal`). La demo guarda su estado en el servidor, así que cada modo corre contra su propia instancia:
//   principal → la suite de siempre, con las órdenes de ejemplo APAGADAS (WMS_DEMO_EJEMPLOS=0): varias pruebas suponen una sola salida (PED-DEMO-101).
//   ejemplos  → solo e2e/ejemplos-por-etapa.spec.ts, con los ejemplos encendidos (puerto +1).
//   vacio     → solo e2e/salidas-vacio.spec.ts, con la demo sin ninguna salida (WMS_DEMO_EJEMPLOS=vacio, puerto +2).
const MODO = (process.env.WMS_E2E_MODO ?? 'principal') as 'principal' | 'ejemplos' | 'vacio'
const ESPECIFICAS = { ejemplos: 'ejemplos-por-etapa.spec.ts', vacio: 'salidas-vacio.spec.ts' } as const
const PUERTO = Number(process.env.WMS_E2E_PUERTO ?? 3100) + (MODO === 'ejemplos' ? 1 : MODO === 'vacio' ? 2 : 0)
const EJEMPLOS = MODO === 'ejemplos' ? '1' : MODO === 'vacio' ? 'vacio' : '0'

export default defineConfig({
  testDir: './e2e',
  ...(MODO === 'principal' ? { testIgnore: Object.values(ESPECIFICAS).map((x) => `**/${x}`) } : { testMatch: `**/${ESPECIFICAS[MODO]}` }),
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
    env: { WMS_DEMO_LOCAL: '1', WMS_DEMO_DATOS: 'sintetico', WMS_DEMO_EJEMPLOS: EJEMPLOS, PORT: String(PUERTO) },
  },
})
