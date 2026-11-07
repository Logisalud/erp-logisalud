// Piloto (0038): banner «PILOTO, datos de prueba» en cada pantalla y la pantalla «Órdenes de compra del piloto». Corre en su propio servidor de la demo
// (WMS_DEMO_MODO_PILOTO=1, puerto +4): ver playwright.config.ts y scripts/e2e-por-viewport.sh.
import { expect, test } from '@playwright/test'
import { capturar, entrarComo, sinDesborde } from './ayudas'

test.describe.configure({ mode: 'serial' })

test.describe('modo piloto', () => {
  test('el banner está arriba en el login y en cada pantalla, no tapa nada y no desborda', async ({ page }, info) => {
    await page.goto('/wms/login')
    await expect(page.getByTestId('banner-piloto')).toContainText('PILOTO, datos de prueba')
    await sinDesborde(page)
    await entrarComo(page, 'jefe_transporte')
    // P1: el primer ingreso muestra la bienvenida del piloto; «Entendido» lleva al Inicio y ya no vuelve a salir
    await page.goto('/wms')
    await expect(page).toHaveURL(/\/wms\/bienvenida\/?$/)
    await expect(page.getByTestId('bienvenida-piloto')).toContainText('Lo oficial sigue siendo el proceso actual')
    await expect(page.getByTestId('bienvenida-piloto')).toContainText('1 de diciembre')
    await page.getByTestId('bienvenida-entendi').click()
    await expect(page).toHaveURL(/\/wms\/?$/)
    await expect(page.getByTestId('enlace-bienvenida-piloto')).toBeVisible()
    for (const ruta of ['/wms', '/wms/entradas', '/wms/salidas', '/wms/kardex', '/wms/alertas']) {
      await page.goto(ruta)
      const b = page.getByTestId('banner-piloto')
      await expect(b).toBeVisible()
      await expect(b).toContainText('PILOTO, datos de prueba')
      const caja = (await b.boundingBox())!
      expect(caja.y).toBeGreaterThanOrEqual(0)
      expect(caja.height).toBeLessThanOrEqual(40)
      // el banner DEMO queda arriba y el del piloto justo debajo (no se pisan)
      const demo = (await page.getByTestId('banner-demo').boundingBox())!
      expect(caja.y).toBeGreaterThanOrEqual(demo.y + demo.height - 1)
      await sinDesborde(page)
    }
    await page.goto('/wms/entradas')
    await capturar(page, info, 'modo-piloto-banner')
  })

  test('«Órdenes de compra del piloto»: lista, revisar Compras con resultado y qué sigue, y la versión queda en 1', async ({ page }, info) => {
    await entrarComo(page, 'asistente_dt')
    await page.goto('/wms/entradas')
    await page.getByTestId('ocs-piloto-enlace').click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Órdenes de compra del piloto')
    // P6: al abrir la pantalla el WMS sincroniza solo con Compras y dice cuándo fue
    await expect(page.getByTestId('sincronizacion-hace')).toContainText('Última sincronización con Compras: hace')
    await expect(page.getByTestId('oc-situacion').first()).toHaveText('Copia al día')
    await sinDesborde(page)
    await capturar(page, info, 'ocs-piloto-sin-copia')
    await page.getByTestId('ocs-revisar').click()
    await expect(page.getByTestId('ocs-exito')).toContainText('ninguna cambió')
    await expect(page.getByTestId('ocs-exito')).toContainText('Siguiente')
    await expect(page.getByTestId('oc-situacion').first()).toHaveText('Copia al día')
    await sinDesborde(page)
    await capturar(page, info, 'ocs-piloto-copiadas')
  })

  test('quien solo mira (auditoría) ve la lista sin botón de revisar', async ({ page }) => {
    await entrarComo(page, 'auditoria_lectura')
    await page.goto('/wms/entradas/oc')
    await expect(page.getByTestId('ocs-piloto')).toBeVisible()
    await expect(page.getByTestId('ocs-revisar')).toHaveCount(0)
  })

  test('PIL-8: en el piloto no se crean productos en el WMS (los crea Compras) y presentación y principio activo no se editan', async ({ page }) => {
    await entrarComo(page, 'asistente_dt')
    await page.goto('/wms/productos')
    await expect(page.getByTestId('productos-en-compras')).toContainText('se crean en Compras')
    await expect(page.getByTestId('nuevo-producto')).toHaveCount(0)
    await page.goto('/wms/productos/nuevo')
    await expect(page).toHaveURL(/\/wms\/productos\/?$/)
    await page.locator('main a[href*="/productos/prod"]:visible').first().click()
    await expect(page.getByTestId('catalogo-en-compras')).toBeVisible()
    await expect(page.locator('#reg-presentacion')).toHaveCount(0)
  })
})
