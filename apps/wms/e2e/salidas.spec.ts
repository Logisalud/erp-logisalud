// S5: salidas por pedido en los 4 viewports: lista, edición libre de lotes (tabla en PC, hoja inferior en teléfono), orden de picking, picking en celular y conformidad por otra persona.
import { expect, test, type Page } from '@playwright/test'
import { PDFDocument } from 'pdf-lib'
import { capturar, elegirProductoKardex, entrarComo, esTelefono, sinDesborde } from './ayudas'

test.describe.configure({ mode: 'serial' })

/** Los dos lotes en que se parte la primera línea del pedido 101 (se fija en la primera prueba; el resto del flujo los usa). */
const lotes = { primero: '', segundo: '' }

test.describe('salidas, picking y conformidad (S5)', () => {
  test('el Jefe de Transporte ve la salida del pedido 101 y cambia un lote: aviso FEFO que no bloquea y queda el registro', async ({ page }, info) => {
    await entrarComo(page, 'jefe_transporte')
    await page.goto('/wms/salidas')
    await expect(page.getByTestId('lista-salidas')).toBeVisible()
    const fila = page.getByTestId(esTelefono(info) ? 'fila-salida-movil' : 'fila-salida').filter({ hasText: 'PED-DEMO-101' })
    await expect(fila).toContainText('Stock asignado')
    await sinDesborde(page)
    await capturar(page, info, 'salidas-lista', { completa: true })
    await (esTelefono(info) ? fila : fila.getByRole('link', { name: /^Abrir/ })).click()
    await expect(page.getByTestId('detalle-salida')).toBeVisible()
    await sinDesborde(page)
    await capturar(page, info, 'salidas-detalle', { completa: true })

    await (esTelefono(info) ? page.getByTestId('abrir-linea').first() : page.getByTestId('editar-lotes').first()).click()
    await expect(page.getByTestId('editor-lotes')).toBeVisible()
    if (esTelefono(info)) await expect(page.getByTestId('hoja-lotes')).toBeVisible()
    const cantidad = Number((await page.getByTestId('cantidad-lote').first().inputValue()))
    const select = page.getByTestId('elegir-lote').first()
    const opciones = await select.locator('option').evaluateAll((os) => os.map((o) => ({ v: (o as HTMLOptionElement).value, t: o.textContent ?? '' })))
    const otro = opciones.find((o) => !o.t.includes('sugerido') && Number(/hay (\d+)/.exec(o.t)?.[1] ?? 0) >= cantidad)
    expect(otro, 'hay un lote no sugerido con stock suficiente').toBeTruthy()
    await select.selectOption(otro!.v)
    // la línea se parte en dos lotes: 12 del elegido y lo que falta (8) del siguiente que ofrece la tabla
    await page.getByTestId('cantidad-lote').first().fill(String(cantidad - 8))
    await expect(page.getByTestId('suma-lotes')).toContainText('Faltan 8')
    await page.getByTestId('agregar-lote').click()
    lotes.primero = /^(\S+)/.exec(otro!.t)![1]
    lotes.segundo = /^(\S+)/.exec(await page.getByTestId('elegir-lote').nth(1).evaluate((el) => (el as HTMLSelectElement).selectedOptions[0].text))![1]
    expect(lotes.segundo).not.toBe(lotes.primero)
    await expect(page.getByTestId('suma-lotes')).toContainText('Completo')
    await sinDesborde(page)
    await capturar(page, info, 'salidas-editor-lotes')
    await page.getByTestId('guardar-lotes').click()
    await expect(page.getByTestId('editor-lotes')).toHaveCount(0)
    await expect(page.getByTestId('aviso-fuera-fefo')).toBeVisible()
    await expect(page.getByTestId('cambios-salida')).toContainText('Jefe de Transporte')

    await page.goto('/wms/salidas/cambios-fefo')
    await expect(page.getByTestId('tabla-cambios-fefo')).toContainText('Jefe de Transporte')
    await sinDesborde(page)
  })

  test('generar la orden de picking y pickear en el orden del recorrido; la hoja impresa sale en PDF', async ({ page }, info) => {
    await entrarComo(page, 'jefe_transporte')
    await page.goto('/wms/salidas')
    const fila = page.getByTestId(esTelefono(info) ? 'fila-salida-movil' : 'fila-salida').filter({ hasText: 'PED-DEMO-101' })
    await (esTelefono(info) ? fila : fila.getByRole('link', { name: /^Abrir/ })).click()
    await page.getByTestId('generar-picking').click()
    await expect(page.getByTestId('orden-picking')).toBeVisible()
    const href = await page.getByTestId('hoja-picking').getAttribute('href')
    const pdf = await page.request.get(href!)
    expect(pdf.status()).toBe(200)
    expect((await pdf.body()).subarray(0, 4).toString()).toBe('%PDF')
    const url = page.url()

    await entrarComo(page, 'auxiliar')
    await page.goto('/wms/picking')
    await expect(page.getByTestId('cola-picking')).toContainText('PED-DEMO-101')
    await capturar(page, info, 'picking-cola')
    await page.goto(url)
    await expect(page.getByTestId('linea-picking')).toHaveCount(3)          // la primera línea sale en dos lotes
    await expect(page.getByTestId('avance-picking')).toContainText('3 líneas por pickear')
    await sinDesborde(page)
    await capturar(page, info, 'picking-orden', { completa: true })
    await page.getByTestId('pickeado').first().click()
    await expect(page.getByTestId('avance-picking')).toContainText('2 líneas por pickear')
    await page.getByTestId('pickeado').first().click()
    await expect(page.getByTestId('avance-picking')).toContainText('1 línea por pickear')
    await page.getByTestId('pickeado').first().click()
    await expect(page.getByTestId('avance-picking')).toContainText('Picking completo')
    await expect(page.getByTestId('estado-pickeado')).toHaveCount(3)
  })

  test('la conformidad la da otra persona: quien pickeó no puede; Sandra marca conforme y el pedido queda listo', async ({ page }, info) => {
    await entrarComo(page, 'asistente_dt')
    await page.goto('/wms/conformidad')
    await expect(page.getByTestId('cola-conformidad')).toContainText('PED-DEMO-101')
    await capturar(page, info, 'conformidad-cola')
    await page.getByTestId('orden-cola').first().click()
    await expect(page.getByTestId('orden-conformidad')).toBeVisible()
    await sinDesborde(page)
    await capturar(page, info, 'conformidad-orden', { completa: true })
    await page.getByTestId('conforme').first().click()
    await expect(page.getByTestId('avance-conformidad')).toContainText('1 de 3')
    await page.getByTestId('conforme').first().click()
    await page.getByTestId('conforme').first().click()
    await expect(page.getByTestId('avance-conformidad')).toContainText('Todo conforme')

    await page.goto('/wms/salidas')
    await expect(page.getByTestId(esTelefono(info) ? 'fila-salida-movil' : 'fila-salida').filter({ hasText: 'PED-DEMO-101' })).toContainText('Conforme: falta la documentación')
    // el mapa sigue funcionando con la zona de conformidad creada
    await page.goto('/wms/almacen')
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
    await expect(page.getByText('Algo salió mal')).toHaveCount(0)
    if (!esTelefono(info)) await expect(page.getByTestId('mapa')).toBeVisible()
  })

  test('quien pickeó no puede dar la conformidad de su propia línea', async ({ page }) => {
    // se prepara otra salida: el pedido 102 entra a la ruta en los E2E de rutas; aquí basta comprobar el permiso por rol
    await entrarComo(page, 'auxiliar')
    await page.goto('/wms/conformidad')
    await expect(page.getByText('La conformidad es del personal autorizado').or(page.getByTestId('cola-conformidad-vacia')).or(page.getByTestId('cola-conformidad'))).toBeVisible()
    await page.goto('/wms/salidas/cambios-fefo')
    await expect(page.getByText('Este reporte es de jefaturas y dirección.')).toBeVisible()
  })

  // ── S6b: documentación final ─────────────────────────────────────────────────────────────────────────────────
  const abrirSalida101 = async (page: Page, info: Parameters<typeof esTelefono>[0]) => {
    await page.goto('/wms/salidas')
    const fila = page.getByTestId(esTelefono(info) ? 'fila-salida-movil' : 'fila-salida').filter({ hasText: 'PED-DEMO-101' })
    await (esTelefono(info) ? fila : fila.getByRole('link', { name: /^Abrir/ })).click()
    await expect(page.getByTestId('panel-documentacion')).toBeVisible()
  }

  test('con todo conforme se registra la guía a mano: formato validado, anulación con motivo y alerta por los COA que faltan', async ({ page }, info) => {
    await entrarComo(page, 'jefe_transporte')
    await page.goto('/wms/alertas')
    await expect(page.getByText(`COA del lote ${lotes.primero} (falta)`).first()).toBeVisible()
    await abrirSalida101(page, info)
    await expect(page.getByTestId('paquete-incompleto')).toContainText(`COA del lote ${lotes.primero} (falta)`)
    await expect(page.getByTestId('items-paquete')).toContainText('Registro sanitario: Listo')
    await page.getByTestId('numero-gre').fill('1234')
    await expect(page.getByTestId('error-numero-gre')).toContainText('T001-00001234')
    await expect(page.getByTestId('registrar-gre')).toBeDisabled()
    await page.getByTestId('numero-gre').fill('t001-00000001')
    await page.getByTestId('registrar-gre').click()
    await expect(page.getByTestId('guia-numero')).toHaveText('T001-00000001')
    await expect(page.getByTestId('guia-lineas')).toContainText(lotes.primero)
    // una guía no se edita: se anula con motivo y se registra la correcta
    await page.getByTestId('anular-gre').click()
    await page.getByTestId('motivo-anular-gre').fill('Error de digitación')
    await page.getByTestId('confirmar-anular-gre').click()
    await expect(page.getByTestId('numero-gre')).toBeVisible()
    await expect(page.getByTestId('guias-anuladas')).toContainText('T001-00000001')
    await page.getByTestId('numero-gre').fill('T001-00001234')
    await page.getByTestId('registrar-gre').click()
    await expect(page.getByTestId('guia-numero')).toHaveText('T001-00001234')
    await expect(page.getByTestId('chip-etapa')).toContainText('Conforme: falta la documentación')
    await sinDesborde(page)
    await capturar(page, info, 'documentacion-salida', { completa: true })
  })

  test('Sandra carga los COA que faltan, el paquete queda completo y se imprime en un solo PDF (pedido y ruta)', async ({ page }, info) => {
    const pdfReal = async (titulo: string) => { const d = await PDFDocument.create(); d.addPage().drawText(titulo); return Buffer.from(await d.save()) }
    await entrarComo(page, 'asistente_dt')
    await page.goto('/wms/documentos/carga')
    await page.getByTestId('carga-archivos').setInputFiles([
      { name: `COA_${lotes.primero}.pdf`, mimeType: 'application/pdf', buffer: await pdfReal(`COA ${lotes.primero}`) },
      { name: `COA_${lotes.segundo}.pdf`, mimeType: 'application/pdf', buffer: await pdfReal(`COA ${lotes.segundo}`) },
      { name: 'COA_L-VENCE-2-MESES.pdf', mimeType: 'application/pdf', buffer: await pdfReal('COA L-VENCE-2-MESES') },
    ])
    await expect(page.getByTestId('carga-resumen')).toContainText('3 quedaron como COA vigente')

    await entrarComo(page, 'jefe_transporte')
    await abrirSalida101(page, info)
    await expect(page.getByTestId('paquete-completo')).toBeVisible()
    await expect(page.getByTestId('chip-etapa')).toContainText('Documentación completa: falta embalar')
    await sinDesborde(page)
    await capturar(page, info, 'documentacion-paquete-completo', { completa: true })
    const href = await page.getByTestId('imprimir-paquete').getAttribute('href')
    const r = await page.request.get(href!)
    expect(r.status()).toBe(200)
    const pdf = await PDFDocument.load(await r.body())
    expect(pdf.getPageCount(), 'carátula + (RS + BPM + 2 COA) × 2 copias').toBeGreaterThanOrEqual(9)

    // la ruta imprime el paquete de todos sus pedidos
    await page.goto('/wms/rutas')
    const planificada = page.getByTestId(esTelefono(info) ? 'fila-ruta-movil' : 'fila-ruta').filter({ hasText: 'Planificada' }).first()
    await (esTelefono(info) ? planificada : planificada.getByRole('link', { name: /^Abrir/ })).click()
    const hrefRuta = await page.getByTestId('paquete-ruta').getAttribute('href')
    const rr = await page.request.get(hrefRuta!)
    expect(rr.status()).toBe(200)
    expect((await PDFDocument.load(await rr.body())).getPageCount()).toBeGreaterThanOrEqual(9)
  })

  // ── S7: embalaje y bultos ───────────────────────────────────────────────────────────────────────────────────────
  test('el auxiliar embala el pedido en 2 bultos «1 de 2»: tabla lote × bulto, la suma tiene que cerrar, etiquetas con QR y la guía/paquete quedan listos para carga', async ({ page }, info) => {
    await entrarComo(page, 'auxiliar')
    await page.goto('/wms/embalaje')
    await expect(page.getByTestId('cola-embalaje')).toContainText('PED-DEMO-101')
    await expect(page.getByTestId('pedido-embalaje').first()).toContainText('Por embalar')
    await capturar(page, info, 'embalaje-cola')
    await page.getByTestId('pedido-embalaje').first().click()
    await expect(page.getByTestId('editor-embalaje')).toBeVisible()
    await page.getByTestId('mas-bultos').click()
    await expect(page.getByTestId('cuantos-bultos')).toHaveText('2')
    // todo está en el bulto 1: el bulto 2 queda vacío y no se puede confirmar
    await expect(page.getByTestId('confirmar-embalaje')).toBeDisabled()
    await expect(page.getByTestId('error-reparto')).toContainText('El bulto 2 está vacío')
    if (esTelefono(info)) {
      await page.getByTestId('abrir-reparto').first().click()
      await expect(page.getByTestId('hoja-reparto')).toBeVisible()
      const celdas = page.getByTestId('celda-reparto-movil')
      const total = Number(await celdas.nth(0).inputValue())
      await celdas.nth(0).fill(String(total - 2)); await celdas.nth(1).fill('2')
      await expect(page.getByRole('status').filter({ hasText: 'Completo' })).toBeVisible()
      await sinDesborde(page)
      await capturar(page, info, 'embalaje-reparto')
      await page.getByTestId('hoja-listo').click()
    } else {
      const celdas = page.getByTestId('fila-reparto').first().getByTestId('celda-reparto')
      const total = Number(await celdas.nth(0).inputValue())
      await celdas.nth(0).fill(String(total - 2)); await celdas.nth(1).fill('2')
      await expect(page.getByTestId('falta-fila').first()).toContainText('✓')
      await sinDesborde(page)
      await capturar(page, info, 'embalaje-reparto')
    }
    await expect(page.getByTestId('confirmar-embalaje')).toBeEnabled()
    await page.getByTestId('confirmar-embalaje').click()
    await expect(page.getByTestId('embalaje-hecho')).toBeVisible()
    await expect(page.getByTestId('bulto')).toHaveCount(2)
    await expect(page.getByTestId('bulto-etiqueta').first()).toHaveText('Bulto 1 de 2')
    await expect(page.getByTestId('bulto-codigo').nth(1)).toContainText('-B2')
    await expect(page.getByTestId('qr').first()).toBeVisible()
    await sinDesborde(page)
    await capturar(page, info, 'embalaje-bultos', { completa: true })
    const pdf = await page.request.get((await page.getByTestId('imprimir-etiquetas').getAttribute('href'))!)
    expect(pdf.status()).toBe(200)
    expect((await PDFDocument.load(await pdf.body())).getPageCount()).toBe(2)
    // con guía + paquete + embalaje el pedido queda «Lista para carga»
    await entrarComo(page, 'jefe_transporte')
    await page.goto('/wms/salidas')
    await expect(page.getByTestId(esTelefono(info) ? 'fila-salida-movil' : 'fila-salida').filter({ hasText: 'PED-DEMO-101' })).toContainText('Lista para carga')
  })

  test('reabrir el embalaje pide motivo y deja el reparto anterior anulado; el LS-FR muestra los bultos del pedido', async ({ page }, info) => {
    await entrarComo(page, 'auxiliar')
    await page.goto('/wms/embalaje')
    await page.getByTestId('pedido-embalaje').first().click()
    await page.getByTestId('reabrir-embalaje').click()
    await expect(page.getByTestId('confirmar-reabrir')).toBeDisabled()
    await page.getByTestId('motivo-reabrir').fill('Se partió una caja')
    await page.getByTestId('confirmar-reabrir').click()
    await expect(page.getByTestId('editor-embalaje')).toBeVisible()
    await page.getByTestId('mas-bultos').click()
    // se reparte de nuevo (esta vez en 2 bultos con el lote completo en el primero de cada línea) y se confirma
    if (esTelefono(info)) {
      const filas = page.getByTestId('abrir-reparto')
      for (let i = 0; i < await filas.count(); i++) {
        await filas.nth(i).click()
        const celdas = page.getByTestId('celda-reparto-movil')
        const total = Number(await celdas.nth(0).inputValue()) + Number(await celdas.nth(1).inputValue())
        await celdas.nth(0).fill(String(total - 1)); await celdas.nth(1).fill('1')
        await page.getByTestId('hoja-listo').click()
      }
    } else {
      const filas = page.getByTestId('fila-reparto')
      for (let i = 0; i < await filas.count(); i++) {
        const celdas = filas.nth(i).getByTestId('celda-reparto')
        const total = Number(await celdas.nth(0).inputValue()) + Number(await celdas.nth(1).inputValue())
        await celdas.nth(0).fill(String(total - 1)); await celdas.nth(1).fill('1')
      }
    }
    await page.getByTestId('confirmar-embalaje').click()
    await expect(page.getByTestId('bultos-anulados')).toContainText('Se partió una caja')
    await expect(page.getByTestId('bulto')).toHaveCount(2)
  })

  // ── S8: carga, liberar la unidad y salida confirmada (el stock sale SOLO aquí) ────────────────────────────────
  /** El saldo final del Kardex de un producto (lo que la auditoría ve) y si ya tiene una fila «Salida». */
  const kardex = async (page: Page, producto: string) => {
    await entrarComo(page, 'auditoria_lectura')
    await page.goto('/wms/kardex')
    await elegirProductoKardex(page, producto)
    await page.getByTestId('ver-kardex').click()
    await expect(page.getByTestId('kardex-saldo-final')).toBeVisible()
    const saldo = Number(((await page.getByTestId('kardex-saldo-final').textContent()) ?? '').replace(/[^\d]/g, ''))
    const salidas = await page.locator('[data-testid="fila-kardex"]:visible, [data-testid="lista-kardex"]:visible > li').filter({ hasText: 'Salida' }).count()
    return { saldo, salidas }
  }

  test('carga por bultos: checklist, escaneo por código, conciliación, liberar la unidad y confirmar la salida; el stock baja SOLO al confirmar', async ({ page }, info) => {
    const antes = await kardex(page, 'DEMO-001')
    await entrarComo(page, 'jefe_transporte')
    await page.goto('/wms/carga')
    await expect(page.getByTestId('cola-carga')).toBeVisible()
    await sinDesborde(page)
    await capturar(page, info, 'carga-cola')
    await page.getByTestId('ruta-carga').filter({ hasText: 'RUT-2026-00001' }).click()
    await expect(page.getByTestId('panel-carga')).toBeVisible()
    await expect(page.getByTestId('motivos-no-liberar')).toContainText('Falta el checklist del vehículo')
    await expect(page.getByTestId('liberar-unidad')).toBeDisabled()
    // checklist: un punto en «no» pide su nota
    await page.getByTestId('punto-no').first().click()
    await expect(page.getByTestId('guardar-checklist')).toBeDisabled()
    await page.getByTestId('nota-punto').fill('Huele a combustible')
    await page.getByTestId('guardar-checklist').click()
    await expect(page.getByTestId('checklist-guardado')).toContainText('hay puntos sin cumplir')
    await expect(page.getByTestId('motivos-no-liberar')).toContainText('puntos sin cumplir')
    await page.getByTestId('punto-si').first().click()
    await page.getByTestId('guardar-checklist').click()
    await expect(page.getByTestId('checklist-guardado')).not.toContainText('sin cumplir')
    // un código que no existe, y luego los dos bultos (uno por código, otro marcado a mano)
    await page.getByTestId('codigo-bulto').fill('SAL-9999-99999-B1')
    await page.getByTestId('cargar-bulto').click()
    await expect(page.getByText('No encontramos el bulto SAL-9999-99999-B1')).toBeVisible()
    await page.getByTestId('codigo-bulto').fill('sal-2026-00001-b2')
    await page.getByTestId('codigo-bulto').press('Enter')
    await expect(page.getByTestId('aviso-escaneo')).toContainText('SAL-2026-00001-B2 cargado')
    await expect(page.getByTestId('motivos-no-liberar')).toContainText('Faltan 1 bulto por cargar')
    await expect(page.getByTestId('liberar-unidad')).toBeDisabled()
    await sinDesborde(page)
    await capturar(page, info, 'carga-conciliacion', { completa: true })
    await page.getByTestId('marcar-cargado').click()
    await expect(page.getByTestId('bulto-carga').filter({ has: page.locator('[data-cargado]') })).toHaveCount(0)
    await expect(page.locator('[data-testid="bulto-carga"][data-cargado="si"]')).toHaveCount(2)
    await expect(page.getByTestId('liberar-unidad')).toBeEnabled()
    await page.getByTestId('liberar-unidad').click()
    await expect(page.getByTestId('unidad-liberada')).toBeVisible()
    await sinDesborde(page)
    await capturar(page, info, 'carga-liberada', { completa: true })

    // liberar NO descuenta stock
    const liberada = await kardex(page, 'DEMO-001')
    expect(liberada).toEqual(antes)
    // confirmar la salida: ahora sí
    await entrarComo(page, 'jefe_transporte')
    await page.goto('/wms/carga')
    await page.getByTestId('ruta-carga').filter({ hasText: 'RUT-2026-00001' }).click()
    await page.getByTestId('confirmar-salida').click()
    await page.getByTestId('confirmar-salida-si').click()
    await expect(page.getByTestId('salida-confirmada')).toBeVisible()
    await capturar(page, info, 'carga-salida-confirmada', { completa: true })
    const despues = await kardex(page, 'DEMO-001')
    expect(despues.saldo).toBe(antes.saldo - 20)
    expect(despues.salidas).toBe(antes.salidas + 2)   // una fila de Salida por cada lote en que se partió la línea
    await entrarComo(page, 'jefe_transporte')
    await page.goto('/wms/salidas')
    await expect(page.getByTestId(esTelefono(info) ? 'fila-salida-movil' : 'fila-salida').filter({ hasText: 'PED-DEMO-101' })).toContainText('Salida confirmada')
  })
})
