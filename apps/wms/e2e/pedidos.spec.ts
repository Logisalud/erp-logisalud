// S3: la bandeja de pedidos por despachar, en los 4 viewports. Pedidos de demostración con la forma exacta del contrato con Pedidos.
import { expect, test, type Page } from '@playwright/test'
import { capturar, entrarComo, esTelefono, sinDesborde } from './ayudas'

test.describe.configure({ mode: 'serial' })

async function cambiarRol(page: Page, rol: Parameters<typeof entrarComo>[1]) {
  await page.getByTestId('cambiar-rol-demo').selectOption(rol)
  await page.waitForTimeout(400)
  await page.reload()
  await expect(page.getByTestId('banner-demo')).toBeVisible()
}

/** La fila de un pedido (tabla en PC y tablet; fila compacta en teléfono). */
const fila = (page: Page, info: { project: { name: string } }, numero: string) =>
  (info.project.name.startsWith('telefono') ? page.getByTestId('fila-pedido-movil') : page.getByTestId('fila-pedido')).filter({ hasText: numero })

async function abrir(page: Page, info: { project: { name: string } }, numero: string) {
  const f = fila(page, info, numero)
  await (info.project.name.startsWith('telefono') ? f.getByTestId('abrir-pedido-movil') : f.getByTestId('abrir-pedido')).click()
  await expect(detalle(page)).toBeVisible()
}

/** El detalle abierto (la tabla y la lista del teléfono comparten estado, pero solo una se ve). */
const detalle = (page: Page) => page.locator('[data-testid="detalle-pedido"]:visible')

test.describe('bandeja de pedidos (S3)', () => {
  test('el Jefe de Transporte ve los pedidos importados, con su estado, y abre el detalle de uno con su producto desconocido', async ({ page }, info) => {
    await entrarComo(page, 'jefe_transporte')
    await page.goto('/wms/pedidos')
    await expect(page.getByTestId('bandeja-pedidos')).toBeVisible()
    await expect(page.getByTestId('bandeja-ultima')).toContainText('Última actualización')
    await expect(page.getByTestId('ped-conteo')).toHaveText('3 pedidos')
    await expect(fila(page, info, 'PED-DEMO-101')).toContainText('Por planificar')
    await expect(fila(page, info, 'PED-DEMO-103')).toContainText('Con salida')
    await sinDesborde(page)
    await capturar(page, info, 'pedidos-bandeja', { completa: true })

    await abrir(page, info, 'PED-DEMO-103')
    await expect(detalle(page).getByTestId('lineas-pedido')).toContainText('SIN-CATALOGO-9')
    await expect(detalle(page).getByTestId('linea-sin-catalogo')).toContainText('No está en el catálogo del WMS')
    await expect(detalle(page)).toContainText('Av. Brasil 2100')
    await sinDesborde(page)
    await capturar(page, info, 'pedidos-detalle', { completa: true })
  })

  test('buscar y filtrar: por cliente sin tildes, por RUC y por estado; sin resultados se puede quitar el filtro', async ({ page }, info) => {
    await entrarComo(page, 'jefe_transporte')
    await page.goto('/wms/pedidos')
    await page.getByTestId('ped-buscar').fill('angeles')
    await expect(page.getByTestId('ped-conteo')).toHaveText('1 de 3 pedidos')
    await expect(fila(page, info, 'PED-DEMO-102')).toBeVisible()
    await page.getByTestId('ped-buscar').fill('20456789123')
    await expect(fila(page, info, 'PED-DEMO-103')).toBeVisible()
    await page.getByTestId('ped-buscar').fill('zzzz')
    await expect(page.getByTestId('ped-sin-resultados')).toBeVisible()
    await capturar(page, info, 'pedidos-sin-resultados')
    await page.getByTestId('ped-limpiar').click()
    await page.getByTestId('ped-filtro-EN_SALIDA').click()
    await expect(page.getByTestId('ped-conteo')).toHaveText('1 de 3 pedidos')
    await expect(fila(page, info, 'PED-DEMO-103')).toBeVisible()
  })

  test('actualizar desde Pedidos: llega uno nuevo y una versión nueva (con lo que cambió y su alerta), se descarta el mal formado y repetir no duplica', async ({ page }, info) => {
    await entrarComo(page, 'jefe_transporte')
    await page.goto('/wms/pedidos')
    await page.getByTestId('actualizar-bandeja').click()
    await expect(page.getByTestId('bandeja-resumen')).toContainText('1 pedido nuevo, 1 con versión nueva')
    await expect(page.getByTestId('bandeja-resumen')).toContainText('PED-DEMO-199: El pedido no trae líneas')
    await expect(page.getByTestId('ped-conteo')).toHaveText('4 pedidos')
    // lo que cambió va primero
    await expect(fila(page, info, 'PED-DEMO-102')).toContainText('Cambió: revisar')
    await expect(fila(page, info, 'PED-DEMO-102')).toContainText('v2')
    await sinDesborde(page)
    await capturar(page, info, 'pedidos-actualizada', { completa: true })

    await abrir(page, info, 'PED-DEMO-102')
    await expect(detalle(page).getByTestId('pedido-cambios')).toContainText('la cantidad pasó de 40 a 60')
    await expect(detalle(page).getByTestId('pedido-cambios')).toContainText('Cambió la ventana de cita')
    await capturar(page, info, 'pedidos-cambio', { completa: true })
    // la alerta llegó al Jefe de Transporte
    await page.goto('/wms/alertas')
    await expect(page.getByTestId('alerta').filter({ hasText: 'PED-DEMO-102 cambió en Pedidos' })).toHaveCount(1)
    // dar por revisado el cambio
    await page.goto('/wms/pedidos')
    await abrir(page, info, 'PED-DEMO-102')
    await detalle(page).getByTestId('pedido-revisar-cambio').click()
    await expect(fila(page, info, 'PED-DEMO-102')).toContainText('Por planificar')
    // actualizar otra vez: nada nuevo, nada duplicado
    await page.getByTestId('actualizar-bandeja').click()
    await expect(page.getByTestId('bandeja-resumen')).toContainText('PED-DEMO-199')
    await expect(page.getByTestId('ped-conteo')).toHaveText('4 pedidos')
  })

  test('quien no planifica no ve la bandeja; el Jefe de Almacén y Dirección Técnica la ven, y solo el Jefe de Almacén actualiza', async ({ page }) => {
    await entrarComo(page, 'auxiliar')
    await page.goto('/wms/pedidos')
    await expect(page.getByTestId('pedidos-sin-permiso')).toBeVisible()
    await expect(page.getByTestId('bandeja-pedidos')).toHaveCount(0)
    await cambiarRol(page, 'direccion_tecnica')
    await page.goto('/wms/pedidos')
    await expect(page.getByTestId('bandeja-pedidos')).toBeVisible()
    await expect(page.getByTestId('actualizar-bandeja')).toHaveCount(0)
    await cambiarRol(page, 'jefe_almacen')
    await page.goto('/wms/pedidos')
    await expect(page.getByTestId('actualizar-bandeja')).toBeVisible()
  })
})
