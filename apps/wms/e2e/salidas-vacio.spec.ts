// SA-1: la pantalla vacía de «Órdenes de salida» (cuando de verdad no hay ninguna). Corre contra su propio servidor con la demo sin salidas
// (WMS_E2E_MODO=vacio → WMS_DEMO_EJEMPLOS=vacio): ver playwright.config.ts y scripts/e2e-por-viewport.sh.
import { expect, test } from '@playwright/test'
import { capturar, entrarComo, sinDesborde } from './ayudas'

test.describe.configure({ mode: 'serial' })

test.describe('Órdenes de salida vacías (SA-1)', () => {
  test('el Jefe de Transporte ve en una frase de dónde nacen las salidas y los dos botones', async ({ page }, info) => {
    await entrarComo(page, 'jefe_transporte')
    await page.goto('/wms/salidas')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Órdenes de salida')
    await expect(page.getByTestId('salidas-vacio')).toBeVisible()
    await expect(page.getByTestId('salidas-vacio-frase')).toHaveText('Las salidas nacen de los pedidos. Trae los pedidos nuevos o crea una salida manual.')
    await expect(page.getByTestId('vacio-traer-pedidos')).toBeEnabled()
    await expect(page.getByTestId('vacio-nueva-orden')).toHaveAttribute('href', '/wms/salidas/nueva')
    await sinDesborde(page)
    await capturar(page, info, 'salidas-vacio')
  })

  test('«Traer pedidos nuevos» trae la bandeja y dice qué sigue; «Nueva Orden de Salida» abre la pantalla de salida manual', async ({ page }) => {
    await entrarComo(page, 'jefe_transporte')
    await page.goto('/wms/salidas')
    await page.getByTestId('vacio-traer-pedidos').click()
    await expect(page.getByTestId('vacio-traer-ok')).toContainText('créales su orden de salida')
    await page.getByTestId('vacio-traer-ok').getByRole('link', { name: 'Ir a Pedidos por despachar' }).click()
    await expect(page).toHaveURL(/\/wms\/pedidos$/)
    await page.goto('/wms/salidas')
    await page.getByTestId('vacio-nueva-orden').click()
    await expect(page).toHaveURL(/\/wms\/salidas\/nueva$/)
  })

  test('quien no puede traer pedidos ni crear salidas no ve botones muertos: se le dice quién lo hace', async ({ page }, info) => {
    await entrarComo(page, 'auditoria_lectura')
    await page.goto('/wms/salidas')
    await expect(page.getByTestId('salidas-vacio')).toBeVisible()
    await expect(page.getByTestId('vacio-traer-pedidos')).toHaveCount(0)
    await expect(page.getByTestId('vacio-nueva-orden')).toHaveCount(0)
    await expect(page.getByTestId('vacio-traer-sin-permiso')).toContainText('Jefe de Transporte')
    await sinDesborde(page)
    await capturar(page, info, 'salidas-vacio-sin-permiso')
  })
})
