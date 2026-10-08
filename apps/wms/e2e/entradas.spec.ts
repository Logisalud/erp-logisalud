// Flujos del Batch 2 (entradas y calidad) en los 4 viewports. Modo demostración, en serie:
// cada prueba parte de lo que dejó la anterior (el servidor se reinicia por viewport).
import { expect, test, type Page } from '@playwright/test'
import { capturar, entrarComo, sinDesborde, type RolDemo } from './ayudas'

test.describe.configure({ mode: 'serial' })

async function cambiarRol(page: Page, rol: RolDemo) {
  await page.getByTestId('cambiar-rol-demo').selectOption(rol)
  await page.waitForTimeout(400)
  await page.reload()
  await expect(page.getByTestId('banner-demo')).toBeVisible()
}

async function abrirIngreso(page: Page, texto: RegExp | string) {
  await page.goto('/wms/entradas')
  await page.getByRole('link', { name: texto }).filter({ visible: true }).first().click()
  await expect(page.getByTestId('titulo-ingreso')).toBeVisible()
}

test.describe('entradas', () => {
  test('la lista muestra los ingresos y su paso', async ({ page }, info) => {
    await entrarComo(page, 'jefe_almacen')
    await page.goto('/wms/entradas')
    await expect(page.getByRole('heading', { name: 'Entradas' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Nuevo ingreso' })).toBeVisible()
    await expect(page.getByText('Acta en firma').filter({ visible: true }).first()).toBeVisible()
    await sinDesborde(page)
    await capturar(page, info, 'entradas-lista', { completa: true })
  })

  test('devolución sin factura o boleta: no se registra y dice por qué', async ({ page }, info) => {
    await entrarComo(page, 'jefe_almacen')
    await page.goto('/wms/entradas/nuevo')
    await page.getByTestId('tipo-DEVOLUCION').click()
    await page.getByLabel('¿De quién es la mercadería?').selectOption({ label: 'TRIAMED' }).catch(async () => {
      await page.locator('#propietario').selectOption({ index: 1 })
    })
    await page.getByLabel('Guía de la devolución').fill('T001-5')
    await page.getByLabel('Producto 1').fill('Losart')
    await page.getByRole('option', { name: /Losartán/ }).click()
    await page.getByLabel('Cantidad').fill('5')
    await page.getByTestId('crear-ingreso').click()
    await expect(page.getByTestId('error-doc-numero')).toContainText('factura o boleta original')
    await sinDesborde(page)
    await capturar(page, info, 'entradas-nuevo-error', { completa: true })
  })

  test('compra local: se elige la recepción de Compras y nace el ingreso con su referencia', async ({ page }, info) => {
    await entrarComo(page, 'jefe_almacen')
    await page.goto('/wms/entradas/nuevo')
    await page.getByTestId('tipo-COMPRA_LOCAL').click()
    await expect(page.getByTestId('recepcion-OC-DEMO-0004')).toBeVisible()
    await capturar(page, info, 'entradas-nuevo', { completa: true })
    await page.getByTestId('recepcion-OC-DEMO-0004').click()
    await page.getByTestId('crear-ingreso').click()
    await expect(page.getByTestId('titulo-ingreso')).toHaveText('OC-DEMO-0004')
    await expect(page.getByTestId('progreso-linea')).toContainText('0 de 300')
  })

  test('lotes: "4 de 6" se actualiza al escribir; 4 + 3 no cuadra y 4 + 2 sí', async ({ page }, info) => {
    await entrarComo(page, 'jefe_almacen')
    await abrirIngreso(page, /OC-DEMO-0002/)
    const prog = page.getByTestId('progreso-linea')
    await expect(prog).toContainText('4 de 6')
    await page.getByRole('button', { name: 'Agregar otro lote' }).click()
    const filas = page.getByTestId('fila-lote')
    await filas.nth(1).getByLabel(/Lote/).fill('M5531')
    await filas.nth(1).getByLabel('Vencimiento').fill('09/2028')
    await filas.nth(1).getByLabel('Cantidad').fill('3')
    await expect(prog).toContainText('7 de 6')
    await expect(prog).toContainText('Sobran 1')
    await expect(filas.nth(1)).toContainText('Solo mes y año')
    await page.getByTestId('guardar-lotes').click()
    await expect(page.getByTestId('generar-acta')).toBeDisabled()
    await expect(page.getByTestId('motivo-sin-acta')).toBeVisible()
    await filas.nth(1).getByLabel('Cantidad').fill('2')
    await expect(prog).toContainText('6 de 6')
    await expect(prog).toContainText('Cuadra con la referencia')
    await capturar(page, info, 'entrada-lotes', { completa: true })
    await page.getByTestId('guardar-lotes').click()
    await expect(page.getByText('Lotes guardados.')).toBeVisible()
  })

  test('acta: se genera, se firma por cuatro partes (el transportista en pantalla) y se confirma', async ({ page }, info) => {
    await entrarComo(page, 'jefe_almacen')
    await abrirIngreso(page, /OC-DEMO-0002/)
    // La temperatura de ese ingreso estaba fuera de rango: se corrige y se guarda.
    await page.getByLabel(/Temperatura/).fill('21')
    await page.getByTestId('guardar-datos').click()
    await expect(page.getByText('Datos de la recepción guardados.')).toBeVisible()
    await page.getByTestId('generar-acta').click()
    await expect(page.getByTestId('numero-acta')).toHaveText(/^I-\d{6}-\d{4}$/)
    await page.getByTestId('firmar-JEFE_ALMACEN').click()
    await expect(page.getByTestId('firma-JEFE_ALMACEN')).toContainText('Firmó')
    // Con la primera firma el contenido queda fijo.
    await expect(page.getByTestId('guardar-datos')).toHaveCount(0)
    await cambiarRol(page, 'direccion_tecnica')
    await page.getByTestId('firmar-DIRECCION_TECNICA').click()
    await expect(page.getByTestId('firma-DIRECCION_TECNICA')).toContainText('Firmó')
    await cambiarRol(page, 'auxiliar')
    await page.getByTestId('firmar-RESPONSABLE_CONTEO').click()
    await expect(page.getByTestId('firma-RESPONSABLE_CONTEO')).toContainText('Firmó')
    // Transportista: nombre, DNI inválido primero, placa y firma dibujada.
    await page.getByTestId('abrir-transportista').click()
    await page.getByLabel('Nombre completo').fill('Pedro Quispe')
    await page.getByLabel('DNI').fill('1234')
    await page.getByTestId('firmar-transportista').click()
    await expect(page.getByText('El DNI tiene 8 dígitos.')).toBeVisible()
    await page.getByLabel('DNI').fill('45678912')
    const lienzo = page.getByTestId('lienzo-firma')
    const caja = (await lienzo.boundingBox())!
    await page.mouse.move(caja.x + 20, caja.y + 40)
    await page.mouse.down()
    await page.mouse.move(caja.x + 90, caja.y + 100, { steps: 6 })
    await page.mouse.move(caja.x + 150, caja.y + 50, { steps: 6 })
    await page.mouse.up()
    await capturar(page, info, 'entrada-firma-transportista', { completa: true })
    await page.getByTestId('firmar-transportista').click()
    await expect(page.getByTestId('firma-TRANSPORTISTA')).toContainText('Firmó')
    await expect(page.getByTestId('firma-TRANSPORTISTA').getByRole('img', { name: /Firma de Pedro Quispe/ })).toBeVisible()
    await cambiarRol(page, 'jefe_almacen')
    await expect(page.getByText('Acta firmada por las cuatro partes')).toBeVisible()
    await page.getByTestId('confirmar-ingreso').click()
    await expect(page.getByTestId('ingreso-confirmado')).toBeVisible()
    await expect(page.getByTestId('lista-organolepticas')).toBeVisible()
    await sinDesborde(page)
    await capturar(page, info, 'entrada-confirmada', { completa: true })
  })

  test('acta firmada no se edita; se anula con motivo y se reemite conservando ambas', async ({ page }, info) => {
    await entrarComo(page, 'jefe_almacen')
    await abrirIngreso(page, /OC-DEMO-0002/)
    await expect(page.getByTestId('guardar-datos')).toHaveCount(0)
    await page.getByTestId('abrir-anular').click()
    await page.getByTestId('confirmar-anular').click()
    await expect(page.getByText('La anulación necesita un motivo')).toBeVisible()
    await page.getByLabel('Motivo').fill('Placa mal escrita')
    await page.getByTestId('confirmar-anular').click()
    await expect(page.getByTestId('reemitir-acta')).toBeVisible()
    await page.getByTestId('reemitir-acta').click()
    await expect(page.getByTestId('acta-vigente')).toContainText('reemplaza a')
    await expect(page.getByTestId('actas-anteriores')).toContainText('Anulada')
    await expect(page.getByTestId('actas-anteriores')).toContainText('Placa mal escrita')
    await capturar(page, info, 'entrada-acta-anulada', { completa: true })
  })

  test('la solicitud de ingreso guarda cada versión', async ({ page }, info) => {
    await entrarComo(page, 'jefe_almacen')
    await abrirIngreso(page, /OC-DEMO-0002/)
    await page.getByLabel('Observaciones de la solicitud').fill('Llegó con retraso')
    await page.getByLabel('¿Por qué el cambio?').fill('Se anotó la demora')
    await page.getByTestId('guardar-solicitud').click()
    await expect(page.getByTestId('version-solicitud')).toContainText('2')
    await page.getByTestId('ver-historial').click()
    await expect(page.getByTestId('historial-solicitud')).toContainText('Se anotó la demora')
    await expect(page.getByTestId('historial-solicitud')).toContainText('Prellenada por el sistema')
    await capturar(page, info, 'entrada-solicitud', { completa: true })
  })

  test('el PDF del acta se genera', async ({ page }) => {
    await entrarComo(page, 'jefe_almacen')
    await abrirIngreso(page, /OC-DEMO-0001/)
    const href = await page.getByTestId('pdf-acta').getAttribute('href')
    const r = await page.request.get(href!)
    expect(r.status()).toBe(200)
    expect(r.headers()['content-type']).toContain('application/pdf')
    expect((await r.body()).subarray(0, 4).toString()).toBe('%PDF')
  })
})

test.describe('calidad', () => {
  test('la cola de Dirección Técnica lista lo pendiente', async ({ page }, info) => {
    await entrarComo(page, 'direccion_tecnica')
    await page.goto('/wms/calidad')
    await expect(page.getByTestId('cola-dt')).toContainText('Pendientes de Dirección Técnica')
    await expect(page.getByTestId('fila-organoleptica').first()).toBeVisible()
    await sinDesborde(page)
    await capturar(page, info, 'calidad-cola', { completa: true })
  })

  test('el acta lleva la muestra calculada y Sandra no puede decidir', async ({ page }) => {
    await entrarComo(page, 'asistente_dt')
    await page.goto('/wms/calidad')
    await page.getByTestId('fila-organoleptica').first().click()
    await expect(page.getByTestId('muestra')).toContainText(/Toma \d+ unidades de muestra/)
    await expect(page.getByTestId('panel-decision')).toHaveCount(0)
  })

  test('Sandra no puede enviar un acta incompleta; dice qué falta', async ({ page }, info) => {
    await entrarComo(page, 'asistente_dt')
    await abrirIngreso(page, /OC-DEMO-0001/)
    await page.getByRole('link', { name: /Lote L24072/ }).click()
    await expect(page.getByTestId('enviar-dt')).toBeDisabled()
    await expect(page.getByTestId('faltan-enviar')).toContainText('certificado')
    await page.getByTestId('marcar-conformes').click()
    await page.getByRole('checkbox', { name: 'Envase de plástico' }).click()
    await page.getByTestId('marcar-conformes').click()
    await page.getByRole('radio', { name: 'Sí' }).last().click().catch(() => {})
    await capturar(page, info, 'calidad-acta-sandra', { completa: true })
  })

  test('Katia aprueba con su firma: el lote queda Aprobado por trasladar', async ({ page }, info) => {
    await entrarComo(page, 'direccion_tecnica')
    await page.goto('/wms/calidad')
    const fila = page.getByTestId('fila-organoleptica').filter({ hasText: 'Atorvastatina' }).first()
    await fila.click()
    await expect(page.getByTestId('panel-decision')).toBeVisible()
    await capturar(page, info, 'calidad-acta-decision', { completa: true })
    await page.getByTestId('aprobar').click()
    await expect(page.getByTestId('resultado-acta')).toContainText('Aprobado')
    await expect(page.getByTestId('resultado-acta')).toContainText('Huella')
    await expect(page.getByTestId('pdf-organoleptica')).toBeVisible()
    await capturar(page, info, 'calidad-acta-firmada', { completa: true })
  })

  test('registro sanitario vencido: se puede rechazar pero no aprobar', async ({ page }, info) => {
    await entrarComo(page, 'direccion_tecnica')
    await page.goto('/wms/calidad')
    await page.getByTestId('fila-organoleptica').filter({ hasText: 'Azitromicina' }).first().click()
    await expect(page.getByTestId('aviso-rs-vencido')).toBeVisible()
    await expect(page.getByTestId('aprobar')).toBeDisabled()
    await expect(page.getByTestId('motivo-no-aprobar')).toContainText('vencido')
    await capturar(page, info, 'calidad-rs-vencido', { completa: true })
    await page.getByTestId('rechazar').click()
    await expect(page.getByTestId('resultado-acta')).toContainText('Bajas/Rechazados')
  })

  test('un acta firmada no se puede decidir de nuevo (el panel desaparece)', async ({ page }) => {
    await entrarComo(page, 'direccion_tecnica')
    await page.goto('/wms/calidad')
    await page.getByTestId('fila-organoleptica').filter({ hasText: 'Aprobado' }).first().click()
    await expect(page.getByTestId('panel-decision')).toHaveCount(0)
    await expect(page.getByTestId('resultado-acta')).toBeVisible()
  })
})

test.describe('alertas y expedientes', () => {
  test('las alertas muestran cada tipo y Katia atiende la suya', async ({ page }, info) => {
    await entrarComo(page, 'direccion_tecnica')
    await page.goto('/wms/alertas')
    await expect(page.getByText('Registro sanitario vencido').first()).toBeVisible()
    await expect(page.getByText('Aprobado sin trasladar').first()).toBeVisible()
    await expect(page.getByText('Compras cambió la cantidad').first()).toBeVisible()
    await sinDesborde(page)
    await capturar(page, info, 'alertas', { completa: true })
    const antes = await page.getByTestId('alerta').count()
    await page.getByTestId('atender-alerta').first().click()
    await expect(page.getByText('Atendida', { exact: true }).first()).toBeVisible()
    expect(antes).toBeGreaterThan(0)
  })

  test('Sandra resuelve los faltantes y cierra el expediente', async ({ page }, info) => {
    await entrarComo(page, 'asistente_dt')
    await page.goto('/wms/expedientes')
    await capturar(page, info, 'expedientes', { completa: true })
    await page.getByTestId('fila-expediente').filter({ hasText: 'OC-DEMO-0001' }).click()
    await expect(page.getByTestId('documentos-expediente')).toContainText('Acta de Recepción')
    await expect(page.getByTestId('cerrar-expediente')).toBeDisabled()
    for (let i = 0; i < 10; i++) {
      const b = page.getByTestId('resolver-faltante').first()
      if (!(await b.count())) break
      await b.click()
      await page.waitForTimeout(400)
    }
    await expect(page.getByTestId('sin-faltantes')).toBeVisible()
    await capturar(page, info, 'expediente', { completa: true })
    await page.getByTestId('cerrar-expediente').click()
    await expect(page.getByTestId('expediente-cerrado')).toBeVisible()
  })

  test('la búsqueda universal encuentra la OC y el acta', async ({ page }) => {
    await entrarComo(page, 'jefe_almacen')
    await page.goto('/wms/entradas')
    await page.getByTestId('abrir-busqueda').click()
    await page.getByRole('dialog', { name: 'Búsqueda' }).locator('input').first().fill('OC-DEMO-0001')
    await expect(page.getByRole('dialog', { name: 'Búsqueda' })).toContainText('Órdenes de compra')
    await expect(page.getByRole('dialog', { name: 'Búsqueda' })).toContainText('OC-DEMO-0001')
  })

  test('el inicio avisa a cada rol lo suyo', async ({ page }) => {
    await entrarComo(page, 'direccion_tecnica')
    await expect(page.getByTestId('atencion')).toContainText('Alertas abiertas')
    await cambiarRol(page, 'asistente_dt')
    await expect(page.getByTestId('atencion')).toContainText('Actas organolépticas por llenar')
    await cambiarRol(page, 'jefe_almacen')
    await expect(page.getByTestId('atencion')).toContainText('Ingresos')
  })
})
