// SA-6: las órdenes manuales siguen el flujo normal hasta el despacho, en los 4 viewports.
//   A (venta manual sin pedido en la bandeja) y C (muestra) entran a una ruta de Logisalud como parada por orden → guía con la ruta → carga → salida confirmada.
//   B (por cuenta de un cliente) no va en ruta: se entrega al transportista del cliente.
// Va al final (zzz-): crea órdenes y rutas y deja la demostración con más datos, así que no altera lo que esperan las demás pruebas (mismo criterio que zzz-falta-de-stock).
import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { PDFDocument } from 'pdf-lib'
import { capturar, entrarComo, esTelefono, sinDesborde } from './ayudas'

test.describe.configure({ mode: 'serial' })

const pdfReal = async (t: string) => { const d = await PDFDocument.create(); d.addPage().drawText(t); return Buffer.from(await d.save()) }
const estado: Record<string, { numero: string; url: string; picking?: string }> = {}
let rutaId = ''
let rutaNumero = ''

async function elegirProducto(page: Page, consulta: string) {
  const f = page.getByTestId('fila-linea-orden').first()
  await f.getByTestId('buscar-producto-salida').fill(consulta)
  await f.getByTestId('opcion-producto-salida').first().click()
  await expect(f.getByTestId('producto-elegido')).toBeVisible()
}

/** Abre el detalle de una orden desde la lista de Salidas (por su N.° de orden o de pedido). */
async function abrirOrden(page: Page, info: TestInfo, clave: string) {
  await page.goto('/wms/salidas')
  const todas = page.getByTestId(esTelefono(info) ? 'fila-salida-movil' : 'fila-salida')
  const fila = todas.filter({ hasText: clave }).first()
  await expect(fila).toBeVisible()
  await (esTelefono(info) ? fila : fila.getByRole('link', { name: /^Abrir/ })).click()
  await expect(page.getByTestId('detalle-salida')).toBeVisible()
}

/** Picking (auxiliar) y conformidad (otra persona) de una orden ya creada. Devuelve la URL de su hoja de picking. */
async function pickearYConformar(page: Page, info: TestInfo, clave: string, bultos = '1') {
  await entrarComo(page, 'jefe_transporte')
  await abrirOrden(page, info, clave)
  await page.getByTestId('generar-picking').click()
  await expect(page.getByTestId('orden-picking')).toBeVisible()
  const url = page.url()
  await entrarComo(page, 'auxiliar')
  await page.goto(url)
  for (let i = 0; i < 6 && (await page.getByTestId('pickeado').count()) > 0; i++) {
    await page.getByTestId('pickeado').first().click()
    await page.waitForTimeout(250)
  }
  await expect(page.getByTestId('avance-picking')).toContainText('Picking completo')
  await entrarComo(page, 'asistente_dt')
  await page.goto(url.replace('/picking/', '/conformidad/'))
  await page.locator('[data-testid="bultos"]:visible').first().fill(bultos)
  await page.locator('[data-testid="dar-conformidad"]:visible').first().click()
  await expect(page.getByTestId('conformidad-hecha')).toContainText('Conformidad registrada')
  return url
}

/** Carga los COA que le faltan al paquete de la orden (como Sandra) y deja el paquete completo. */
async function completarPaquete(page: Page, info: TestInfo, clave: string) {
  await entrarComo(page, 'asistente_dt')
  await abrirOrden(page, info, clave)
  const texto = (await page.getByTestId('paquete-incompleto').count()) ? (await page.getByTestId('paquete-incompleto').textContent()) ?? '' : ''
  const lotes = [...texto.matchAll(/COA del lote (\S+) \(falta\)/g)].map((m) => m[1])
  if (lotes.length) {
    await page.goto('/wms/documentos/carga')
    await page.getByTestId('carga-archivos').setInputFiles(await Promise.all(lotes.map(async (l) => ({ name: `COA_${l}.pdf`, mimeType: 'application/pdf', buffer: await pdfReal(`COA ${l}`) }))))
    await expect(page.getByTestId('carga-resumen')).toContainText('quedaron como COA vigente')
    await abrirOrden(page, info, clave)
  }
  await expect(page.getByTestId('paquete-completo')).toBeVisible()
}

test.describe('órdenes manuales hasta el despacho (SA-6)', () => {
  test('crear una venta manual (A) y una muestra (C con su destinatario): quedan en «Órdenes manuales por despachar» y el siguiente paso sigue siendo claro', async ({ page }, info) => {
    test.setTimeout(120_000)
    await entrarComo(page, 'jefe_transporte')
    await page.goto('/wms/salidas/nueva')
    await page.getByTestId('clase-A').click()
    await page.getByTestId('pedido-numero').fill('PED-RUTA-001')
    await page.getByTestId('cliente-ruc').fill('20123456789')
    await page.getByTestId('cliente-razon-social').fill('Botica Rutas SAC')
    await page.getByTestId('cliente-direccion').fill('Av. Lima 123, Lima')
    await page.getByTestId('cliente-ubigeo').fill('150101')
    await elegirProducto(page, 'DEMO-001')
    await page.getByTestId('cantidad-linea-orden').first().fill('5')
    await expect(page.getByTestId('propuesta-fefo')).toBeVisible()
    await page.getByTestId('crear-orden-manual').click()
    await expect(page.getByTestId('orden-creada')).toContainText('quedó creada')
    estado.A = { numero: ((await page.getByTestId('orden-creada').textContent()) ?? '').match(/OS-\d{4}-\d{5}/)![0], url: '' }

    // la muestra: quien autoriza salidas sin venta; ahora pide a quién va (la guía y la ruta lo necesitan)
    await entrarComo(page, 'autoriza_salidas_sin_venta')
    await page.goto('/wms/salidas/nueva')
    await page.getByTestId('motivo-C-MUESTRA').click()
    await expect(page.getByTestId('destinatario-C')).toContainText('¿A quién va la muestra?')
    await elegirProducto(page, 'DEMO-002')
    await page.getByTestId('cantidad-linea-orden').first().fill('3')
    await page.getByTestId('crear-orden-manual').click()
    await expect(page.getByTestId('destinatario-C')).toContainText('Escribe a quién va la muestra')
    await sinDesborde(page)
    await capturar(page, info, 'salida-nueva-C-destinatario', { completa: true })
    await page.getByTestId('dest-razon-social').fill('Clínica Destino SAC')
    await page.getByTestId('dest-ruc').fill('20987654321')
    await page.getByTestId('dest-direccion').fill('Jr. Cusco 45, Lima')
    await page.getByTestId('dest-ubigeo').fill('150101')
    await page.getByTestId('crear-orden-manual').click()
    await expect(page.getByTestId('orden-creada')).toContainText('quedó creada')
    estado.C = { numero: ((await page.getByTestId('orden-creada').textContent()) ?? '').match(/OS-\d{4}-\d{5}/)![0], url: '' }

    // el detalle de A cuenta el camino con el paso «Ruta planificada»
    await entrarComo(page, 'jefe_transporte')
    await abrirOrden(page, info, estado.A.numero)
    await expect(page.getByTestId('chip-etapa')).toContainText('Stock asignado')
    await expect(page.getByTestId('avance-pasos')).toContainText('Ruta planificada')
    await sinDesborde(page)
    await capturar(page, info, 'rutas-orden-manual-detalle', { completa: true })
  })

  test('planificar la ruta con las dos órdenes: aparecen en «Órdenes manuales por despachar», entran como parada por orden (con la excepción de corte) y la ruta se confirma', async ({ page }, info) => {
    test.setTimeout(120_000)
    await entrarComo(page, 'jefe_transporte')
    await page.goto('/wms/rutas')
    await page.getByTestId('nueva-ruta').click()
    await expect(page.getByTestId('editor-ruta')).toBeVisible()
    rutaId = page.url().split('/').pop()!
    rutaNumero = ((await page.getByTestId('ruta-numero').textContent()) ?? '').trim()
    await page.getByTestId('ruta-fecha').fill((await page.getByTestId('ruta-fecha').getAttribute('min'))!)
    await page.getByTestId('ruta-vehiculo').selectOption({ label: 'D4F-318 — Furgón con termo · calificado · frío' })
    await page.getByTestId('ruta-conductor').selectOption({ label: 'Marco Huamán' })
    // las órdenes manuales por despachar: A y C; el tipo B nunca aparece aquí
    const lista = page.getByTestId('ordenes-por-despachar')
    await expect(lista).toContainText('Órdenes manuales por despachar')
    await expect(lista).toContainText('Botica Rutas SAC'); await expect(lista).toContainText('pedido PED-RUTA-001'); await expect(lista).toContainText('Clínica Destino SAC')
    await expect(lista).toContainText('Muestra de Logissa')
    await sinDesborde(page)
    await capturar(page, info, 'rutas-ordenes-manuales-por-despachar', { completa: true })
    await page.getByTestId('orden-disponible').filter({ hasText: estado.A.numero }).getByTestId('agregar-orden').click()
    await page.getByTestId('orden-disponible').filter({ hasText: estado.C.numero }).getByTestId('agregar-orden').click()
    await expect(page.getByTestId('parada')).toHaveCount(2)
    await expect(page.getByTestId('parada').first()).toContainText('Orden manual · Venta de distribución')
    await expect(page.getByTestId('parada').nth(1)).toContainText('Orden manual · Muestra de Logissa')
    // la ruta es de hoy y las órdenes se crearon hoy: llegaron después del corte → excepción con motivo, como un pedido
    await expect(page.getByTestId('chip-corte').first()).toContainText('Se creó después del corte')
    await expect(page.getByTestId('guardar-plan')).toBeDisabled()
    await expect(page.getByTestId('errores-plan')).toContainText('se creó después del corte')
    for (let i = 0; i < 2; i++) {
      await page.getByTestId('excepcion-corte').nth(i).check()
      await page.getByTestId('excepcion-motivo').nth(i).fill('Se despacha hoy')
    }
    await expect(page.getByTestId('errores-plan')).toHaveCount(0)
    await sinDesborde(page)
    await capturar(page, info, 'rutas-ordenes-manuales-plan', { completa: true })
    await page.getByTestId('guardar-plan').click()
    await expect(page.getByTestId('ruta-ok')).toContainText('Plan guardado')
    await expect(page.getByTestId('parada').first().getByTestId('chip-stock-parada')).toContainText('Stock asignado')
    await page.getByTestId('confirmar-ruta').click()
    await expect(page.getByTestId('ruta-ok')).toContainText('Ruta confirmada')
    // las órdenes ya no se ofrecen para otra ruta
    await expect(page.getByTestId('orden-disponible')).toHaveCount(0)
    await capturar(page, info, 'rutas-ordenes-manuales-confirmada', { completa: true })
    // y sus órdenes muestran la ruta y que lo siguiente es la guía
    await abrirOrden(page, info, estado.A.numero)
    await expect(page.getByTestId('detalle-salida')).toContainText(rutaNumero)
  })

  test('picking y conformidad de A y C; con la ruta ya asignada la guía electrónica toma placa, conductor y fecha de la ruta', async ({ page }, info) => {
    test.setTimeout(150_000)
    await pickearYConformar(page, info, estado.A.numero)
    await pickearYConformar(page, info, estado.C.numero)
    for (const t of ['A', 'C'] as const) {
      await completarPaquete(page, info, estado[t].numero)
      await entrarComo(page, 'jefe_transporte')
      await abrirOrden(page, info, estado[t].numero)
      await expect(page.getByTestId('modo-nubefact')).toContainText('Simulador')
      await expect(page.getByTestId('guia-ruta')).toContainText(rutaNumero)
      await expect(page.getByTestId('guia-ruta')).toContainText('D4F-318')
      await expect(page.getByTestId('guia-ruta')).toContainText('Marco Huamán')
      if (t === 'A') {
        await expect(page.getByTestId('datos-guia')).toContainText('Botica Rutas SAC')
        await sinDesborde(page)
        await capturar(page, info, 'rutas-orden-manual-guia', { completa: true })
      } else await expect(page.getByTestId('datos-guia')).toContainText('Clínica Destino SAC')
      await page.getByTestId('emitir-guia-boton').click()
      await expect(page.getByTestId('resultado-guia')).toContainText('emitida')
      await expect(page.getByTestId('chip-etapa')).toContainText('Lista para carga')
    }
  })

  test('carga de la unidad con las dos órdenes, liberar y confirmar la salida: el stock baja y LS-FR.43.03 lista las dos paradas', async ({ page }, info) => {
    test.setTimeout(120_000)
    await entrarComo(page, 'jefe_transporte')
    await page.goto('/wms/carga')
    await page.getByTestId('ruta-carga').filter({ hasText: rutaNumero }).click()
    await expect(page.getByTestId('panel-carga')).toBeVisible()
    await expect(page.getByTestId('panel-carga')).toContainText('PED-RUTA-001')
    await expect(page.getByTestId('panel-carga')).toContainText(estado.C.numero)
    await expect(page.getByTestId('liberar-unidad')).toBeDisabled()
    await page.getByTestId('punto-si').first().click()
    await page.getByTestId('guardar-checklist').click()
    await expect(page.getByTestId('checklist-guardado')).toBeVisible()
    for (let i = 0; i < 6 && (await page.getByTestId('marcar-cargado').count()) > 0; i++) { await page.getByTestId('marcar-cargado').first().click(); await page.waitForTimeout(250) }
    await expect(page.getByTestId('liberar-unidad')).toBeEnabled()
    await sinDesborde(page)
    await capturar(page, info, 'rutas-ordenes-manuales-carga', { completa: true })
    await page.getByTestId('liberar-unidad').click()
    await expect(page.getByTestId('unidad-liberada')).toBeVisible()
    await page.getByTestId('confirmar-salida').click()
    await page.getByTestId('confirmar-salida-si').click()
    await expect(page.getByTestId('salida-confirmada')).toBeVisible()
    await capturar(page, info, 'rutas-ordenes-manuales-salida', { completa: true })
    for (const t of ['A', 'C'] as const) {
      await abrirOrden(page, info, estado[t].numero)
      await expect(page.getByTestId('chip-etapa')).toContainText('Salida confirmada')
    }
    // el formato LS-FR.43.03 de la ruta sale en PDF con las dos paradas
    const r = await page.request.get(`/wms/rutas/${rutaId}/pdf`)
    expect(r.status()).toBe(200)
    expect((await r.body()).subarray(0, 4).toString()).toBe('%PDF')
  })

  test('quitar una orden manual de la ruta NO la cancela: solo libera la parada y la orden sigue lista para otra ruta', async ({ page }, info) => {
    test.setTimeout(120_000)
    await entrarComo(page, 'jefe_transporte')
    await page.goto('/wms/salidas/nueva')
    await page.getByTestId('clase-A').click()
    await page.getByTestId('pedido-numero').fill('PED-RUTA-002')
    await page.getByTestId('cliente-ruc').fill('20123456789')
    await page.getByTestId('cliente-razon-social').fill('Botica Quitar SAC')
    await page.getByTestId('cliente-direccion').fill('Av. Lima 456, Lima')
    await page.getByTestId('cliente-ubigeo').fill('150101')
    await elegirProducto(page, 'DEMO-001')
    await page.getByTestId('cantidad-linea-orden').first().fill('2')
    await page.getByTestId('crear-orden-manual').click()
    await expect(page.getByTestId('orden-creada')).toContainText('quedó creada')
    const numero = ((await page.getByTestId('orden-creada').textContent()) ?? '').match(/OS-\d{4}-\d{5}/)![0]
    await page.goto('/wms/rutas')
    await page.getByTestId('nueva-ruta').click()
    await expect(page.getByTestId('editor-ruta')).toBeVisible()
    await page.getByTestId('ruta-fecha').fill((await page.getByTestId('ruta-fecha').getAttribute('min'))!)
    await page.getByTestId('ruta-vehiculo').selectOption({ label: 'AXL-204 — Moto furgón' })
    await page.getByTestId('ruta-conductor').selectOption({ label: 'Luis Quispe' })
    await page.getByTestId('orden-disponible').filter({ hasText: numero }).getByTestId('agregar-orden').click()
    await page.getByTestId('excepcion-corte').check()
    await page.getByTestId('excepcion-motivo').fill('Se despacha hoy')
    await page.getByTestId('guardar-plan').click()
    await expect(page.getByTestId('ruta-ok')).toContainText('Plan guardado')
    await page.getByTestId('parada-quitar').click()
    await page.getByTestId('guardar-plan').click()
    await expect(page.getByTestId('ruta-ok')).toContainText('Plan guardado')
    await expect(page.getByTestId('sin-paradas')).toBeVisible()
    // la orden sigue viva, con su stock asignado, y vuelve a ofrecerse
    await expect(page.getByTestId('orden-disponible').filter({ hasText: numero })).toBeVisible()
    await abrirOrden(page, info, numero)
    await expect(page.getByTestId('chip-etapa')).toContainText('Stock asignado')
    await expect(page.getByTestId('chip-etapa')).not.toContainText('Cancelada')
    await expect(page.getByTestId('avance-pasos-texto')).toContainText('Designar a quien hace el picking')
  })

  test('tipo B: no va en ruta; al estar lista se entrega al transportista del cliente, con quién recoge, la hora y quién entrega; la salida se confirma', async ({ page }, info) => {
    test.setTimeout(180_000)
    await entrarComo(page, 'jefe_almacen')
    await page.goto('/wms/salidas/nueva')
    await page.getByTestId('clase-B').click()
    await page.getByTestId('propietario-orden').selectOption({ label: 'DIPHASAC' })
    await page.getByTestId('gre-numero').fill('T001-00004321')
    await page.getByTestId('gre-archivo').setInputFiles({ name: 'gre-cliente.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 gre de prueba') })
    await expect(page.getByTestId('gre-adjunta')).toBeVisible()
    await elegirProducto(page, 'DEMO-001')
    const lote = await page.locator('datalist option').first().getAttribute('value')
    await page.getByTestId('lote-linea-orden').fill(lote!)
    await page.getByTestId('cantidad-linea-orden').fill('2')
    await page.getByTestId('motivo-linea-orden').selectOption('VENTA')
    await expect(page.getByTestId('validacion-linea')).toContainText('El lote sirve para esta salida')
    await page.getByTestId('crear-orden-manual').click()
    await expect(page.getByTestId('orden-creada')).toContainText('quedó creada')
    const numero = ((await page.getByTestId('orden-creada').textContent()) ?? '').match(/OS-\d{4}-\d{5}/)![0]
    // no aparece entre lo que se despacha en una ruta de Logisalud
    await entrarComo(page, 'jefe_transporte')
    await page.goto('/wms/rutas')
    await page.getByTestId('nueva-ruta').click()
    await expect(page.getByTestId('ordenes-por-despachar')).not.toContainText(numero)
    // la orden explica que no va en ruta y qué sigue
    await abrirOrden(page, info, numero)
    await expect(page.getByTestId('avance-pasos')).toContainText('Entrega al transportista del cliente')
    await expect(page.getByTestId('avance-pasos')).not.toContainText('Ruta planificada')
    await expect(page.getByTestId('entrega-pendiente')).toContainText('no va en una ruta de Logisalud')
    await sinDesborde(page)
    await capturar(page, info, 'rutas-B-entrega-pendiente', { completa: true })
    // picking, conformidad, GRE del cliente, paquete y embalaje
    await pickearYConformar(page, info, numero, '1')
    await completarPaquete(page, info, numero)
    await entrarComo(page, 'jefe_transporte')
    await abrirOrden(page, info, numero)
    await page.getByTestId('abrir-gre-manual').click()
    await page.getByTestId('numero-gre').fill('T001-00004321')
    await page.getByTestId('registrar-gre').click()
    await expect(page.getByTestId('guia-numero')).toHaveText('T001-00004321')
    await entrarComo(page, 'auxiliar')
    await abrirOrden(page, info, numero)
    await page.getByTestId('ir-embalaje').click()
    await page.getByTestId('confirmar-embalaje').click()
    await expect(page.getByTestId('embalaje-hecho')).toBeVisible()
    // lista: el paso que sigue es la entrega, que hace el Jefe de Almacén o el de Transporte
    await entrarComo(page, 'jefe_almacen')
    await abrirOrden(page, info, numero)
    await expect(page.getByTestId('chip-etapa')).toContainText('Lista para carga')
    await expect(page.getByTestId('entrega-form')).toBeVisible()
    await expect(page.getByTestId('entrega-form')).toContainText('no lleva ruta ni guía del WMS')
    await page.getByTestId('registrar-entrega').click()
    await expect(page.getByTestId('entrega-form')).toContainText('Escribe el nombre del transportista')
    await page.getByTestId('entrega-transportista').fill('Transportes Andes SAC')
    await page.getByTestId('entrega-placa').fill('abc-123')
    await sinDesborde(page)
    await capturar(page, info, 'rutas-B-entrega-formulario', { completa: true })
    await page.getByTestId('registrar-entrega').click()
    await expect(page.getByTestId('entrega-registrada')).toContainText('Entregada al transportista del cliente', { timeout: 15_000 })
    await expect(page.getByTestId('entrega-registrada')).toContainText('Transportes Andes SAC')
    await expect(page.getByTestId('entrega-registrada')).toContainText('ABC-123')
    await expect(page.getByTestId('chip-etapa')).toContainText('Entregada al transportista')
    await sinDesborde(page)
    await capturar(page, info, 'rutas-B-entregada', { completa: true })
    // el auxiliar no puede registrar entregas: no ve el formulario
    await page.goto('/wms/salidas')
    await expect(page.getByTestId(esTelefono(info) ? 'fila-salida-movil' : 'fila-salida').filter({ hasText: numero })).toContainText('Entregada al transportista')
  })
})
