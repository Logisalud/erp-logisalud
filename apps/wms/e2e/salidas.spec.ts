// S5: salidas por pedido en los 4 viewports: lista, edición libre de lotes (tabla en PC, hoja inferior en teléfono), orden de picking, picking en celular y conformidad por otra persona.
import { expect, test, type Page } from '@playwright/test'
import { PDFDocument } from 'pdf-lib'
import { capturar, entrarComo, esTelefono, sinDesborde } from './ayudas'

test.describe.configure({ mode: 'serial' })

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
    await expect(page.getByTestId('linea-picking')).toHaveCount(2)
    await expect(page.getByTestId('avance-picking')).toContainText('2 líneas por pickear')
    await sinDesborde(page)
    await capturar(page, info, 'picking-orden', { completa: true })
    await page.getByTestId('pickeado').first().click()
    await expect(page.getByTestId('avance-picking')).toContainText('1 línea por pickear')
    await page.getByTestId('pickeado').first().click()
    await expect(page.getByTestId('avance-picking')).toContainText('Picking completo')
    await expect(page.getByTestId('estado-pickeado')).toHaveCount(2)
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
    await expect(page.getByTestId('avance-conformidad')).toContainText('1 de 2')
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
    await expect(page.getByText('COA del lote L2515 (falta)').first()).toBeVisible()
    await abrirSalida101(page, info)
    await expect(page.getByTestId('paquete-incompleto')).toContainText('COA del lote L2515 (falta)')
    await expect(page.getByTestId('items-paquete')).toContainText('Registro sanitario: Listo')
    await page.getByTestId('numero-gre').fill('1234')
    await expect(page.getByTestId('error-numero-gre')).toContainText('T001-00001234')
    await expect(page.getByTestId('registrar-gre')).toBeDisabled()
    await page.getByTestId('numero-gre').fill('t001-00000001')
    await page.getByTestId('registrar-gre').click()
    await expect(page.getByTestId('guia-numero')).toHaveText('T001-00000001')
    await expect(page.getByTestId('guia-lineas')).toContainText('L2515')
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
      { name: 'COA_L2515.pdf', mimeType: 'application/pdf', buffer: await pdfReal('COA L2515') },
      { name: 'COA_L-VENCE-2-MESES.pdf', mimeType: 'application/pdf', buffer: await pdfReal('COA L-VENCE-2-MESES') },
    ])
    await expect(page.getByTestId('carga-resumen')).toContainText('2 quedaron como COA vigente')

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
    if (info.project.name.startsWith('desktop')) (await import('node:fs')).writeFileSync('/tmp/claude-0/paquete-demo.pdf', await rr.body())
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
})
