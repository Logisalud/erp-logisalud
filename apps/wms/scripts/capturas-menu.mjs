// Capturas del menú lateral por rol y viewport (evidencia del antes/después de docs/wms/ux-menu-lateral.md).
// Uso (con el servidor demo en marcha): WMS_E2E_PUERTO=3204 PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium \
//   node scripts/capturas-menu.mjs menu-antes
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const carpeta = process.argv[2] ?? 'menu-despues'
const puerto = process.env.WMS_E2E_PUERTO ?? '3100'
const salida = resolve(dirname(fileURLToPath(import.meta.url)), '../../../docs/wms/screenshots', carpeta)
mkdirSync(salida, { recursive: true })
const ROLES = ['jefe_transporte', 'jefe_almacen', 'auxiliar', 'asistente_dt', 'direccion_tecnica', 'autoriza_salidas_sin_venta', 'auditoria_lectura', 'admin_wms']
const VIEWPORTS = [
  { n: 'desktop-1440x900', w: 1440, h: 900 },
  { n: 'laptop-1280x800', w: 1280, h: 800 },
  { n: 'tablet-1024x768', w: 1024, h: 768 },
  { n: 'telefono-390x844', w: 390, h: 844, mas: true },
]
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined })
for (const v of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h }, hasTouch: !!v.mas, locale: 'es-PE', timezoneId: 'America/Lima' })
  const page = await ctx.newPage()
  for (const rol of ROLES) {
    await ctx.clearCookies()
    await page.goto(`http://localhost:${puerto}/wms/login`)
    await page.getByTestId(`entrar-${rol}`).click()
    await page.waitForURL(/\/wms\/?$/)
    await page.getByTestId('banner-demo').waitFor()
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(400)
    await page.screenshot({ path: resolve(salida, `${rol}-${v.n}.png`) })
    if (v.mas) {
      await page.getByRole('button', { name: 'Más' }).click()
      await page.waitForTimeout(500)
      await page.screenshot({ path: resolve(salida, `${rol}-telefono-mas-390x844.png`) })
    }
  }
  await ctx.close()
}
await browser.close()
console.log('listo:', salida)
