import { expect, type Page, type TestInfo } from '@playwright/test'

export type RolDemo = 'direccion_tecnica' | 'asistente_dt' | 'jefe_almacen' | 'jefe_transporte' | 'reemplazante_jefe' | 'auxiliar' | 'admin_wms' | 'auditoria_lectura' | 'autoriza_salidas_sin_venta'

import { hoyLima } from '../lib/hoy-lima'

/**
 * El día de HOY para las pruebas es el de Lima, igual que en la demo y en la base: no `new Date().toISOString()`, que es UTC y entre las 19:00 y las 24:00
 * de Lima ya marca el día siguiente (chocaba con la ruta que la demo siembra para mañana). `enDias(n)` = Lima hoy + n días.
 */
export const hoyDeLima = () => hoyLima()
export const enDias = (n: number) => new Date(Date.parse(`${hoyLima()}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

export const esTelefono = (info: TestInfo) => info.project.name.startsWith('telefono')

export async function entrarComo(page: Page, rol: RolDemo) {
  await page.context().clearCookies()
  await page.goto('/wms/login')
  await page.getByTestId(`entrar-${rol}`).click()
  await page.waitForURL(/\/wms(\/bienvenida)?\/?$/) // en el piloto el primer ingreso cae en la bienvenida
  await expect(page.getByTestId('banner-demo')).toBeVisible()
}

/**
 * Ya no se guardan capturas de pantalla (decisión de Sebas, 2026-11-07): las pantallas se verifican con aserciones, no a ojo.
 * Se conserva la función y su firma para no tocar cada prueba que la llama; no escribe nada y no ensucia el árbol de git.
 */
export async function capturar(_page: Page, _info: TestInfo, _pantalla: string, _opciones: { completa?: boolean } = {}) {}

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

/** Elige un producto en el buscador del Kardex: escribe y toca la primera opción (por nombre o código). */
export async function elegirProductoKardex(page: Page, consulta: string) {
  await page.locator('#k-producto').fill(consulta)
  await page.locator('[role="option"] button').first().click()
  await expect(page.getByTestId('k-producto-valor')).not.toHaveValue('')
}
