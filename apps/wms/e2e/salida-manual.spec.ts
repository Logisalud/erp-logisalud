// SA-2: cómo iniciar una Orden de Salida — a mano (tipos A, B y C) y desde la bandeja, en los 4 viewports.
import { expect, test, type Page } from '@playwright/test'
import { capturar, entrarComo, sinDesborde } from './ayudas'

test.describe.configure({ mode: 'serial' })

async function elegirProducto(page: Page, fila: number, consulta = 'DEMO-001') {
  const f = page.getByTestId('fila-linea-orden').nth(fila)
  await f.getByTestId('buscar-producto-salida').fill(consulta)
  await f.getByTestId('opcion-producto-salida').first().click()
  await expect(f.getByTestId('producto-elegido')).toBeVisible()
}

test.describe('Nueva Orden de Salida', () => {
  test('el Jefe de Transporte ve los tres tipos explicados y crea una venta manual (A) con su número de pedido; el mismo número se rechaza al instante', async ({ page }, info) => {
    await entrarComo(page, 'jefe_transporte')
    await page.goto('/wms/salidas')
    await page.getByTestId('nueva-orden-salida').click()
    await expect(page.getByTestId('form-orden-manual')).toBeVisible()
    for (const c of ['A', 'B', 'C']) await expect(page.getByTestId(`clase-${c}`)).toBeVisible()
    await expect(page.getByTestId('clase-A')).toContainText('La crea solo el Jefe de Transporte')
    await sinDesborde(page)
    await capturar(page, info, 'salida-nueva-tipos', { completa: true })

    await page.getByTestId('clase-A').click()
    await page.getByTestId('pedido-numero').fill('PED-E2E-001')
    await page.getByTestId('cliente-ruc').fill('20123456789')
    await page.getByTestId('cliente-razon-social').fill('Botica Salud SAC')
    await page.getByTestId('cliente-direccion').fill('Av. Lima 123, Lima')
    await page.getByTestId('cliente-ubigeo').fill('150101')
    await elegirProducto(page, 0)
    await page.getByTestId('cantidad-linea-orden').first().fill('5')
    await expect(page.getByTestId('propuesta-fefo')).toContainText('Propuesta por vencimiento')
    await sinDesborde(page)
    await capturar(page, info, 'salida-nueva-A', { completa: true })
    await page.getByTestId('crear-orden-manual').click()
    await expect(page.getByTestId('orden-creada')).toContainText('quedó creada')
    await expect(page.getByTestId('orden-creada')).toContainText('Sigue:')
    await sinDesborde(page)
    await capturar(page, info, 'salida-nueva-creada', { completa: true })

    // el mismo número: aviso inmediato con enlace a la orden, y no se crea
    await page.getByTestId('crear-otra-orden').click()
    await page.getByTestId('clase-A').click()
    await page.getByTestId('pedido-numero').fill(' ped-e2e-001 ')
    await expect(page.getByTestId('aviso-pedido-con-orden')).toContainText('ya tiene la Orden de Salida')
    await expect(page.getByTestId('aviso-pedido-con-orden').getByRole('link', { name: 'Abrir esa orden' })).toBeVisible()
    await capturar(page, info, 'salida-nueva-duplicado', { completa: true })
    await page.getByTestId('crear-orden-manual').click()
    await expect(page.getByTestId('error-pedido-numero')).toContainText('Un pedido no puede tener dos órdenes')

    // la orden manual se ve en la lista con su etiqueta y en el detalle con su origen
    await page.goto('/wms/salidas')
    await expect(page.getByTestId('etiqueta-POR_CONCILIAR').first()).toContainText('Por conciliar con Pedidos')
    await capturar(page, info, 'salidas-lista-origen', { completa: true })
    if (info.project.name.startsWith('telefono')) await page.getByTestId('fila-salida-movil').filter({ hasText: 'PED-E2E-001' }).click()
    else await page.getByTestId('fila-salida').filter({ hasText: 'PED-E2E-001' }).getByRole('link').first().click()
    await expect(page.getByTestId('origen-orden')).toContainText('Botica Salud SAC')
    await expect(page.getByTestId('aviso-por-conciliar')).toBeVisible()
    await capturar(page, info, 'salida-detalle-manual', { completa: true })
  })

  test('tipo B: por cuenta de un cliente, con su GRE y validación inmediata por línea; queda «creada por X en nombre de Y»', async ({ page }, info) => {
    await entrarComo(page, 'jefe_almacen')
    await page.goto('/wms/salidas/nueva')
    await page.getByTestId('clase-B').click()
    await expect(page.getByText('Elige primero el cliente de almacenamiento')).toBeVisible()
    await page.getByTestId('propietario-orden').selectOption({ label: 'DIPHASAC' })
    await page.getByTestId('gre-numero').fill('T001-00001234')
    await page.getByTestId('gre-archivo').setInputFiles({ name: 'gre-cliente.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 gre de prueba') })
    await expect(page.getByTestId('gre-adjunta')).toContainText('gre-cliente.pdf')
    await elegirProducto(page, 0)
    // un lote que no existe: el mensaje sale al instante
    await page.getByTestId('lote-linea-orden').fill('NO-EXISTE-77')
    await page.getByTestId('cantidad-linea-orden').fill('2')
    await page.getByTestId('motivo-linea-orden').selectOption('VENTA')
    await expect(page.getByTestId('validacion-linea')).toContainText('No encontramos el lote NO-EXISTE-77')
    await capturar(page, info, 'salida-nueva-B-error', { completa: true })
    // el lote de la guía: se toma uno del propietario
    const lote = await page.locator('datalist option').first().getAttribute('value')
    expect(lote).toBeTruthy()
    await page.getByTestId('lote-linea-orden').fill(lote!)
    await expect(page.getByTestId('validacion-linea')).toContainText('El lote sirve para esta salida')
    await expect(page.getByTestId('vence-linea-orden')).not.toContainText('Se completa')
    await sinDesborde(page)
    await capturar(page, info, 'salida-nueva-B', { completa: true })
    await page.getByTestId('crear-orden-manual').click()
    await expect(page.getByTestId('orden-creada')).toContainText('quedó creada')
    await page.getByTestId('abrir-orden-creada').click()
    await expect(page.getByTestId('origen-orden')).toContainText('en nombre de DIPHASAC')
    await expect(page.getByTestId('gre-del-cliente')).toHaveText('T001-00001234')
    await capturar(page, info, 'salida-detalle-B', { completa: true })
  })

  test('tipo C: la muestra solo la crea quien autoriza salidas sin venta; el Jefe de Almacén ve C sin la muestra', async ({ page }, info) => {
    await entrarComo(page, 'reemplazante_jefe')
    await page.goto('/wms/salidas/nueva')
    await expect(page.getByTestId('clase-A')).toHaveCount(0) // la venta manual es solo del Jefe de Transporte
    await page.getByTestId('clase-C').click()
    await expect(page.getByTestId('motivo-C-MUESTRA')).toBeDisabled()
    await expect(page.getByTestId('motivo-C-DEVOLUCION_PROVEEDOR')).toBeEnabled()

    await entrarComo(page, 'autoriza_salidas_sin_venta')
    await page.goto('/wms/salidas/nueva')
    await expect(page.getByTestId('datos-C')).toBeVisible() // es su único tipo: ya viene elegido
    await page.getByTestId('motivo-C-MUESTRA').click()
    await elegirProducto(page, 0)
    await page.getByTestId('cantidad-linea-orden').fill('2')
    await expect(page.getByTestId('propuesta-fefo')).toBeVisible()
    await sinDesborde(page)
    await capturar(page, info, 'salida-nueva-C', { completa: true })
    await page.getByTestId('crear-orden-manual').click()
    await expect(page.getByTestId('orden-creada')).toContainText('quedó creada')
  })

  test('quien no puede crear salidas a mano ve el motivo y no el formulario', async ({ page }) => {
    await entrarComo(page, 'auxiliar')
    await page.goto('/wms/salidas/nueva')
    await expect(page.getByTestId('nueva-salida-sin-permiso')).toBeVisible()
    await expect(page.getByTestId('form-orden-manual')).toHaveCount(0)
  })
})

test.describe('desde la bandeja de pedidos', () => {
  test('«Crear orden de salida» por pedido y «crear las órdenes de todos los pedidos por planificar»; lo que no se puede se explica', async ({ page }, info) => {
    await entrarComo(page, 'jefe_transporte')
    await page.goto('/wms/pedidos')
    await expect(page.getByTestId('como-iniciar-salida')).toContainText('Desde aquí')
    await expect(page.getByTestId('como-iniciar-salida')).toContainText('A mano')
    await sinDesborde(page)
    await capturar(page, info, 'pedidos-crear-orden', { completa: true })
    // uno solo (desde el detalle: sirve igual en el teléfono)
    const movil = info.project.name.startsWith('telefono')
    const fila = (n: string) => (movil ? page.getByTestId('fila-pedido-movil') : page.getByTestId('fila-pedido')).filter({ hasText: n })
    await (movil ? fila('PED-DEMO-102').getByTestId('abrir-pedido-movil') : fila('PED-DEMO-102').getByTestId('abrir-pedido')).click()
    await page.locator('[data-testid="crear-orden-pedido"]:visible').click()
    await expect(page.getByTestId('crear-orden-ok')).toContainText('PED-DEMO-102')
    await expect(fila('PED-DEMO-102')).toContainText('Con salida')
    await capturar(page, info, 'pedidos-orden-creada', { completa: true })
    // todos los demás: el 103 trae un producto que el WMS no conoce y se explica
    await page.getByTestId('crear-ordenes-todas').click()
    await expect(page.getByTestId('crear-ordenes-resumen')).toContainText('PED-DEMO-103')
    await expect(page.getByTestId('crear-ordenes-errores')).toContainText('no conoce')
    await sinDesborde(page)
    await capturar(page, info, 'pedidos-crear-todas', { completa: true })
  })
})
