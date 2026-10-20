// SA-3: cuando falta stock (por qué falta, decide el vendedor, copiar el aviso), cuando el pedido cambia o se cancela, y lo picado que vuelve a su ubicación con un movimiento
// verificado. Corre al final (zzz): usa el pedido 104 de la demostración, que ninguna otra prueba deja con orden. Lleva su estado de un test al siguiente.
import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { capturar, entrarComo, esTelefono, sinDesborde } from './ayudas'

test.describe.configure({ mode: 'serial' })

const filaSalida = (page: Page, info: TestInfo) => page.getByTestId(esTelefono(info) ? 'fila-salida-movil' : 'fila-salida').filter({ hasText: 'PED-DEMO-104' }).first()
async function abrirSalida104(page: Page, info: TestInfo) {
  await page.goto('/wms/salidas')
  const f = filaSalida(page, info)
  await (esTelefono(info) ? f : f.getByRole('link', { name: /^Abrir/ })).click()
  await expect(page.getByTestId('detalle-salida')).toBeVisible()
}
async function abrirPedido104(page: Page, info: TestInfo) {
  await page.goto('/wms/pedidos')
  const f = (esTelefono(info) ? page.getByTestId('fila-pedido-movil') : page.getByTestId('fila-pedido')).filter({ hasText: 'PED-DEMO-104' })
  await (esTelefono(info) ? f.getByTestId('abrir-pedido-movil') : f.getByTestId('abrir-pedido')).click()
  const d = page.locator('[data-testid="detalle-pedido"]:visible')
  await expect(d).toBeVisible()
  return d
}

test.describe('cuando falta stock (SA-3)', () => {
  test('un pedido sin stock suficiente: la orden explica por qué falta, dice quién decide y se copia el aviso para el vendedor', async ({ page, context }, info) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => undefined)
    await entrarComo(page, 'jefe_transporte')
    await page.goto('/wms/pedidos')
    await page.getByTestId('actualizar-bandeja').click()
    await expect(page.getByTestId('bandeja-resumen')).toBeVisible()
    // una ruta nueva con el pedido 104 (no hay stock para 250.000 unidades)
    await page.goto('/wms/rutas')
    // una fecha lejana: el vehículo y el conductor están libres aunque otras pruebas hayan armado rutas de hoy o de mañana, y no aplica el corte de la víspera
    await page.getByTestId('nueva-ruta-fecha').fill(new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10))
    await page.getByTestId('nueva-ruta').click()
    await expect(page.getByTestId('editor-ruta')).toBeVisible()
    await page.getByTestId('ruta-vehiculo').selectOption({ label: 'BKW-757 — Camioneta cerrada · calificado' })
    await page.getByTestId('ruta-conductor').selectOption({ label: 'Luis Quispe' })
    await page.getByTestId('agregar-buscar').fill('PED-DEMO-104')
    await page.getByTestId('pedido-disponible').filter({ hasText: 'PED-DEMO-104' }).getByTestId('agregar-pedido').click()
    if (await page.getByTestId('excepcion-corte').count()) { await page.getByTestId('excepcion-corte').check(); await page.getByTestId('excepcion-motivo').fill('Cliente urgente') }
    await page.getByTestId('guardar-plan').click()
    await expect(page.getByTestId('aviso-bloqueados')).toContainText('PED-DEMO-104')

    await abrirSalida104(page, info)
    await expect(page.getByTestId('chip-etapa')).toContainText('Sin stock suficiente')
    // «Dónde va y qué sigue»: decide el vendedor, no el Jefe de Transporte
    await expect(page.getByTestId('avance-pasos-siguiente')).toContainText('Sigue: el vendedor Rosa Paredes decide con el cliente si se quita lo que falta o se cancela el pedido')
    await expect(page.getByTestId('avance-pasos-quien')).toContainText('Lo hace: Vendedor Rosa Paredes')
    // por qué falta, con cantidades
    await expect(page.getByTestId('falta-de-stock')).toBeVisible()
    await expect(page.getByTestId('faltante-texto')).toContainText(/Stock insuficiente: pide 250000 y hay \d+ disponibles\. Faltan \d+: .*sin stock\./)
    await expect(page.getByTestId('falta-quien-decide')).toContainText('quitar o reducir la línea')
    await expect(page.getByTestId('falta-quien-decide')).toContainText('cancelar el pedido')
    // el Jefe de Transporte lo ve pero no cambia cantidades: no hay botones para eso ni para generar el picking
    await expect(page.getByTestId('generar-picking')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /cantidad/i })).toHaveCount(0)
    await expect(page.getByTestId('factura-estado')).toContainText('Factura: pendiente')
    await sinDesborde(page)
    await capturar(page, info, 'falta-de-stock-orden', { completa: true })
    // copiar el aviso
    await expect(page.getByTestId('aviso-vendedor-texto')).toContainText('Hola Rosa Paredes, no podemos despachar completo el pedido PED-DEMO-104')
    await page.getByTestId('copiar-aviso-orden').click()
    await expect(page.getByTestId('copiar-aviso-orden')).toContainText('Copiado')
    const copiado = await page.evaluate(() => navigator.clipboard.readText()).catch(() => null)
    if (copiado !== null) { expect(copiado).toContain('PED-DEMO-104'); expect(copiado).toContain('2) Cancelar el pedido.') }
    await capturar(page, info, 'falta-de-stock-copiado')

    // lo mismo desde la bandeja
    const d = await abrirPedido104(page, info)
    await expect(d.getByTestId('pedido-falta-stock')).toContainText('decide el vendedor Rosa Paredes')
    await d.getByTestId('copiar-aviso-bandeja').click()
    await expect(d.getByTestId('copiar-aviso-bandeja')).toContainText('Copiado')
    await sinDesborde(page)
    await capturar(page, info, 'falta-de-stock-bandeja', { completa: true })
  })

  test('el vendedor reduce la línea en Pedidos: la orden se actualiza sola, ya no falta stock y la factura llega solo para leerla', async ({ page }, info) => {
    await entrarComo(page, 'jefe_transporte')
    const d = await abrirPedido104(page, info)
    await expect(d.getByTestId('simular-en-pedidos')).toBeVisible()
    await d.getByTestId('simular-REDUCIR').click()
    await expect(d.getByTestId('simular-ok')).toContainText('La orden de salida se actualizó sola')
    await abrirSalida104(page, info)
    await expect(page.getByTestId('falta-de-stock')).toHaveCount(0)
    await expect(page.getByTestId('chip-etapa')).toContainText('Stock asignado')
    await expect(page.getByTestId('avance-pasos-siguiente')).toContainText('Designar a quien hace el picking')
    const alertas = (await page.request.get('/wms/alertas')).status()
    expect(alertas).toBe(200)
    // Pedidos factura: la orden solo lo muestra
    await page.goto('/wms/pedidos')
    const d2 = await abrirPedido104(page, info)
    await d2.getByTestId('simular-FACTURAR').click()
    await expect(d2.getByTestId('simular-ok')).toBeVisible()
    await abrirSalida104(page, info)
    await expect(page.getByTestId('factura-estado')).toContainText(/Factura: facturada F001-\d{5}/)
    await expect(page.getByRole('textbox')).toHaveCount(0)   // nadie digita la factura
    await sinDesborde(page)
    await capturar(page, info, 'falta-de-stock-resuelta', { completa: true })
  })

  test('con el picking ya hecho, cancelar el pedido pide devolver lo picado; otra persona lo verifica y recién entonces la orden se cancela', async ({ page }, info) => {
    test.setTimeout(120_000)
    await entrarComo(page, 'jefe_transporte')
    await abrirSalida104(page, info)
    await page.getByTestId('generar-picking').click()
    await expect(page.getByTestId('orden-picking')).toBeVisible()
    await entrarComo(page, 'auxiliar')
    await page.goto('/wms/picking')
    await page.getByTestId('cola-picking').getByText('PED-DEMO-104').first().click()
    await expect(page.getByTestId('orden-picking')).toBeVisible()
    await expect(page.getByTestId('pickeado').first()).toBeVisible()
    for (let i = 0; i < 30; i++) {
      const n = await page.getByTestId('pickeado').count()
      if (!n) break
      await page.getByTestId('pickeado').first().click()
      await expect(page.getByTestId('pickeado')).toHaveCount(n - 1)
    }
    await expect(page.getByTestId('avance-picking')).toContainText('Picking completo')
    await entrarComo(page, 'asistente_dt')
    await page.goto('/wms/conformidad')
    await page.getByTestId('orden-cola').filter({ hasText: 'PED-DEMO-104' }).first().click()
    await page.getByTestId('bultos').fill('1')
    await page.getByTestId('dar-conformidad').click()
    await expect(page.getByTestId('conformidad-hecha')).toBeVisible()

    // Pedidos cancela el pedido
    await entrarComo(page, 'jefe_transporte')
    const d = await abrirPedido104(page, info)
    await d.getByTestId('simular-CANCELAR').click()
    await expect(d.getByTestId('simular-ok')).toBeVisible()
    await abrirSalida104(page, info)
    await expect(page.getByTestId('chip-etapa')).toContainText('Por devolver lo picado')
    await expect(page.getByTestId('pedido-cancelado-aviso')).toContainText('Pedidos canceló este pedido')
    await expect(page.getByTestId('avance-pasos-siguiente')).toContainText('Sigue: el auxiliar devuelve lo picado a su ubicación y otra persona lo verifica')
    await expect(page.getByTestId('devolver-picado')).toBeVisible()
    await expect(page.getByTestId('fila-devolucion').first()).toContainText('Por devolver')
    // el Jefe de Transporte lo ve, pero no hay nada que él pueda dar por devuelto verificado
    await expect(page.getByTestId('devolver-picado-verificar')).toHaveCount(0)
    await sinDesborde(page)
    await capturar(page, info, 'falta-de-stock-por-devolver', { completa: true })

    // el auxiliar devuelve; quien devolvió no verifica
    await entrarComo(page, 'auxiliar')
    await abrirSalida104(page, info)
    await page.getByTestId('devolver-picado-ejecutar').click()
    await expect(page.getByTestId('fila-devolucion').first()).toContainText('Devuelta: falta verificar')
    await expect(page.getByTestId('avance-pasos-siguiente')).toContainText('otra persona verifica que lo picado volvió a su ubicación')
    await capturar(page, info, 'falta-de-stock-devuelto', { completa: true })
    // otra persona lo verifica y la orden se cancela
    await entrarComo(page, 'jefe_almacen')
    await abrirSalida104(page, info)
    await page.getByTestId('devolver-picado-verificar').click()
    await expect(page.getByTestId('chip-etapa')).toContainText('Cancelada')
    await expect(page.getByTestId('fila-devolucion').first()).toContainText('Verificada')
    await sinDesborde(page)
    await capturar(page, info, 'falta-de-stock-cancelada', { completa: true })
    // en la bandeja el pedido queda «Cancelado en Pedidos» con su motivo
    await entrarComo(page, 'jefe_transporte')
    const d3 = await abrirPedido104(page, info)
    await expect(d3.getByTestId('pedido-cancelado')).toContainText('Motivo: El cliente ya no lo necesita')
    await expect((esTelefono(info) ? page.getByTestId('fila-pedido-movil') : page.getByTestId('fila-pedido')).filter({ hasText: 'PED-DEMO-104' })).toContainText('Cancelado en Pedidos')
    await capturar(page, info, 'falta-de-stock-pedido-cancelado', { completa: true })
  })
})
