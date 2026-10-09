import { expect, type Page, type TestInfo } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

export type RolDemo = 'direccion_tecnica' | 'asistente_dt' | 'jefe_almacen' | 'reemplazo_jefe' | 'auxiliar' | 'admin_wms' | 'auditoria_lectura'

const CARPETA = resolve(__dirname, '../../../docs/wms/screenshots')

export const esTelefono = (info: TestInfo) => info.project.name.startsWith('telefono')

export async function entrarComo(page: Page, rol: RolDemo) {
  await page.context().clearCookies()
  await page.goto('/wms/login')
  await page.getByTestId(`entrar-${rol}`).click()
  await page.waitForURL(/\/wms\/?$/)
  await expect(page.getByTestId('banner-demo')).toBeVisible()
}

/** Guarda docs/wms/screenshots/<pantalla>/<viewport>.png (una por pantalla y viewport). */
export async function capturar(page: Page, info: TestInfo, pantalla: string, opciones: { completa?: boolean } = {}) {
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(250) // el mapa se ajusta con ResizeObserver; las animaciones de entrada terminan
  const dir = resolve(CARPETA, pantalla)
  mkdirSync(dir, { recursive: true })
  await page.screenshot({ path: resolve(dir, `${info.project.name}.png`), fullPage: opciones.completa ?? false })
}

/** Ningún desborde horizontal: la página no se puede desplazar de lado. */
export async function sinDesborde(page: Page) {
  const r = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, ancho: window.innerWidth }))
  expect(r.scroll, `desborde horizontal: ${r.scroll} > ${r.ancho}`).toBeLessThanOrEqual(r.ancho + 1)
}

export async function esperarMapa(page: Page) {
  await expect(page.getByTestId('mapa')).toBeVisible()
  await page.waitForFunction(() => {
    const g = document.querySelector('[data-testid="mapa"] svg > g')
    return !!g && /scale\((?!1\))/.test(g.getAttribute('transform') ?? '')
  })
}
