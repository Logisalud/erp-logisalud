// SA-1: con las órdenes de ejemplo encendidas, abrir «Órdenes de salida» ya muestra una orden en cada etapa y de cada tipo (4 viewports + capturas).
// Corre contra su propio servidor (WMS_E2E_MODO=ejemplos): ver playwright.config.ts y scripts/e2e-por-viewport.sh.
import { expect, test } from '@playwright/test'
import { capturar, entrarComo, esTelefono, sinDesborde } from './ayudas'

test.describe.configure({ mode: 'serial' })

const filaDe = (page: import('@playwright/test').Page, info: import('@playwright/test').TestInfo) => page.getByTestId(esTelefono(info) ? 'fila-salida-movil' : 'fila-salida')

/** En el teléfono la fila entera es el enlace; en pantalla grande, el número de la orden. */
const abrirOrden = (page: import('@playwright/test').Page, info: import('@playwright/test').TestInfo, pedido: string) => {
  const fila = filaDe(page, info).filter({ hasText: pedido })
  return (esTelefono(info) ? fila : fila.getByRole('link').first()).click()
}

test.describe('órdenes de ejemplo (SA-1)', () => {
  test('al abrir Órdenes de salida ya hay órdenes de ejemplo en cada etapa, con su etiqueta y su siguiente paso', async ({ page }, info) => {
    await entrarComo(page, 'jefe_transporte')
    await page.goto('/wms/salidas')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Órdenes de salida')
    await expect(page.getByTestId('lista-salidas')).toBeVisible()
    await expect(page.getByTestId('salidas-vacio')).toHaveCount(0)
    const filas = filaDe(page, info)
    await expect(filas).toHaveCount(25)    // la de siempre (PED-DEMO-101) + 24 de ejemplo
    for (const [pedido, etapa] of [
      ['PED-DEMO-201', 'Stock asignado'], ['PED-DEMO-202', 'En picking'], ['PED-DEMO-203', 'Pendiente de conformidad'], ['PED-DEMO-204', 'Conforme'],
      ['PED-DEMO-205', 'Documentación completa'], ['PED-DEMO-206', 'Embalada'], ['PED-DEMO-207', 'Lista para carga'], ['PED-DEMO-208', 'Salida confirmada'],
      ['PED-DEMO-209', 'Sin stock suficiente'], ['PED-DEMO-223', 'Lista para carga'], ['PED-DEMO-224', 'Salida confirmada'], ['PED-DEMO-210', 'Cancelada'], ['PED-DEMO-212', 'Por devolver lo picado'],
    ]) await expect(filas.filter({ hasText: pedido }), pedido).toContainText(etapa)
    // cada orden dice qué sigue (en el teléfono, «Sigue: …»; en pantalla grande, además, quién lo hace)
    const n = await filas.count()
    for (let i = 0; i < n; i++) await expect(filas.nth(i)).toContainText(esTelefono(info) ? 'Sigue:' : /Lo hace:|Terminada|Cancelada: no se hace nada/)
    // las de ejemplo llevan la etiqueta; la de siempre no
    await expect(filas.getByTestId('etiqueta-EJEMPLO')).toHaveCount(24)
    await expect(filas.filter({ hasText: 'PED-DEMO-101' }).getByTestId('etiqueta-EJEMPLO')).toHaveCount(0)
    // los tres tipos (B llega hasta la entrega al transportista del cliente)
    await expect(filas.filter({ hasText: 'Entregada al transportista' })).toHaveCount(1)
    await expect(filas.getByTestId('etiqueta-tipo').filter({ hasText: 'Por cuenta de un cliente' }).first()).toBeVisible()
    await expect(filas.getByTestId('etiqueta-tipo').filter({ hasText: 'Muestra de Logissa' }).first()).toBeVisible()
    await expect(filas.getByTestId('etiqueta-tipo').filter({ hasText: 'Devolución al proveedor' }).first()).toBeVisible()
    await expect(filas.getByTestId('etiqueta-POR_CONCILIAR').first()).toBeVisible()
    await sinDesborde(page)
    await capturar(page, info, 'salidas-ejemplos', { completa: true })
  })

  test('filtrar por etapa y buscar sin resultados: «Ninguna orden coincide» con «Quitar filtros»', async ({ page }, info) => {
    await entrarComo(page, 'jefe_transporte')
    await page.goto('/wms/salidas')
    await page.getByTestId('filtro-etapa').selectOption('SIN_STOCK')
    await expect(filaDe(page, info)).toContainText('PED-DEMO-209')
    await page.getByTestId('filtro-etapa').selectOption('')
    await page.getByTestId('buscar-salidas').fill('zzzz-no-existe')
    await expect(page.getByTestId('salidas-sin-coincidencias')).toContainText('Ninguna orden coincide con tu búsqueda')
    await expect(page.getByTestId('salidas-vacio')).toHaveCount(0)
    await sinDesborde(page)
    await capturar(page, info, 'salidas-sin-coincidencias')
    await page.getByTestId('quitar-filtros-salidas').click()
    await expect(page.getByTestId('lista-salidas')).toBeVisible()
    await expect(filaDe(page, info)).toHaveCount(25)
  })

  test('la orden con falta de stock explica por qué falta y deja copiar el aviso para el vendedor; la salida confirmada está terminada', async ({ page }, info) => {
    await entrarComo(page, 'jefe_transporte')
    await page.goto('/wms/salidas')
    await abrirOrden(page, info, 'PED-DEMO-209')
    await expect(page.getByTestId('falta-de-stock')).toBeVisible()
    await expect(page.getByTestId('faltante-texto').first()).toContainText(/faltan|falta/i)
    await expect(page.getByTestId('aviso-vendedor-texto')).toContainText('PED-DEMO-209')
    await page.goto('/wms/salidas')
    await abrirOrden(page, info, 'PED-DEMO-208')
    await expect(page.getByTestId('detalle-salida')).toBeVisible()
    await expect(page.getByTestId('detalle-salida')).toContainText('Salida confirmada')
    await expect(page.getByTestId('etiqueta-EJEMPLO').first()).toBeVisible()
  })

  test('las colas de trabajo ya tienen qué hacer: picking, conformidad, embalaje y carga', async ({ page }) => {
    await entrarComo(page, 'jefe_transporte')
    for (const [ruta, texto] of [['/wms/picking', 'PED-DEMO-202'], ['/wms/conformidad', 'PED-DEMO-203'], ['/wms/embalaje', 'PED-DEMO-205']]) {
      await page.goto(ruta)
      await expect(page.locator('main'), ruta).toContainText(texto)
    }
    await page.goto('/wms/carga')
    await expect(page.locator('main')).toContainText('RUT-')
  })

  test('las pantallas que leen el stock (Almacén, Pedidos por despachar, Rutas) abren sin error con los ejemplos sembrados', async ({ page }) => {
    await entrarComo(page, 'jefe_almacen')
    await page.goto('/wms/salidas')
    await expect(page.getByTestId('lista-salidas')).toBeVisible()
    for (const ruta of ['/wms/almacen', '/wms/pedidos', '/wms/rutas', '/wms/kardex']) {
      const r = await page.goto(ruta)
      expect(r?.status(), ruta).toBeLessThan(400)
    }
    await page.goto('/wms/pedidos')
    await expect(page.getByTestId('bandeja-pedidos')).toContainText('PED-DEMO-211')
  })
})

// SB-D: baja de la guía después de la salida, devoluciones de ejemplo y rol Administrador (corre al final: cambia una orden de ejemplo).
test.describe('SB-D', () => {
  test('una guía que ya salió se da de baja sin tocar el stock y la orden queda «falta guía vigente»', async ({ page }, info) => {
    await entrarComo(page, 'jefe_transporte')
    await page.goto('/wms/salidas')
    await abrirOrden(page, info, 'PED-DEMO-224')
    await expect(page.getByTestId('detalle-salida')).toContainText('Salida confirmada')
    await page.getByTestId('anular-gre').click()
    await expect(page.getByTestId('caso-1')).toBeDisabled()
    await expect(page.getByTestId('caso-2')).toBeDisabled()
    await page.getByTestId('caso-3').check()
    await expect(page.getByTestId('que-sigue-anulacion')).toContainText('El stock NO se toca')
    await page.getByTestId('motivo-anular-gre').fill('La contadora pidió otra serie')
    await sinDesborde(page)
    await capturar(page, info, 'sb-d-baja-tras-salida', { completa: true })
    await page.getByTestId('confirmar-anular-gre').click()
    await expect(page.getByTestId('resultado-guia')).toContainText('El stock no se tocó')
    await expect(page.getByTestId('falta-guia-vigente')).toContainText('Guía anulada, falta guía vigente')
    await expect(page.getByTestId('detalle-salida')).toContainText('Emitir la guía nueva')
    await sinDesborde(page)
    await capturar(page, info, 'sb-d-falta-guia-vigente', { completa: true })
  })

  test('hay una devolución de ejemplo en cada etapa', async ({ page }, info) => {
    await entrarComo(page, 'jefe_almacen')
    await page.goto('/wms/entradas')
    await expect(page.locator('main')).toContainText('Devolución')
    const r = await page.goto('/wms/retornos')
    expect(r?.status()).toBeLessThan(400)
    await sinDesborde(page)
    await capturar(page, info, 'sb-d-devoluciones')
  })

  test('el Administrador opera y configura, pero no firma decisiones sanitarias', async ({ page }, info) => {
    await entrarComo(page, 'admin_wms')
    await expect(page.getByTestId('cambiar-rol-demo')).toHaveValue('admin_wms')
    await expect(page.getByTestId('cambiar-rol-demo').locator('option:checked')).toHaveText('Administrador')
    await page.goto('/wms/salidas/nueva')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await page.goto('/wms/auditoria')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await sinDesborde(page)
    await capturar(page, info, 'sb-d-administrador')
  })
})
