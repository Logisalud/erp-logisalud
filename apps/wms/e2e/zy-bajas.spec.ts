// OS-6: Bajas con sustento por motivo y la Orden de Baja LS-FR.56.01, en los 4 viewports. Corre casi al final (antes de zz-excepciones) porque
// da de baja el lote vencido de la demo (Ibuprofeno L-VENCIDO) y eso cambia las alertas y los vencimientos que otros archivos miran.
import { expect, test, type Page } from '@playwright/test'
import { capturar, entrarComo, sinDesborde } from './ayudas'

test.describe.configure({ mode: 'serial' })

const PDF_MINIMO = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n')

async function elegirPropietario(page: Page, codigo: string) {
  const valor = await page.getByTestId('propietario-baja').locator('option', { hasText: codigo }).first().getAttribute('value')
  await page.getByTestId('propietario-baja').selectOption(valor!)
}

async function buscarYAgregar(page: Page, consulta: string, lote: string) {
  await page.getByTestId('buscar-stock-baja').fill(consulta)
  const fila = page.getByTestId('resultado-stock-baja').filter({ hasText: `Lote ${lote}` })
  await expect(fila).toHaveCount(1)
  await fila.getByTestId('agregar-stock-baja').click()
}

test.describe('Bajas (OS-6)', () => {
  test('sin bajas todavía: la lista y «Nueva baja» se explican solas, y quien no puede pedir una baja lo ve claro', async ({ page }, info) => {
    await entrarComo(page, 'jefe_almacen')
    await page.goto('/wms/bajas')
    await expect(page.getByRole('heading', { name: 'Bajas', level: 1 })).toBeVisible()
    await expect(page.getByTestId('bajas-vacio')).toContainText('No hay bajas esperando autorización')
    await expect(page.getByTestId('nueva-baja')).toBeVisible()
    await sinDesborde(page)
    await capturar(page, info, 'bajas-lista-vacia', { completa: true })

    await page.getByTestId('nueva-baja').click()
    await expect(page.getByRole('heading', { name: 'Nueva baja', level: 1 })).toBeVisible()
    await expect(page.getByTestId('sin-lineas-baja')).toBeVisible()
    await expect(page.getByTestId('solicitar-baja')).toBeDisabled()
    await page.getByTestId('buscar-stock-baja').fill('zzzz-no-existe')
    await expect(page.getByTestId('sin-stock-baja')).toContainText('No encontramos stock para dar de baja')
    await sinDesborde(page)
    await capturar(page, info, 'bajas-nueva-sin-resultados', { completa: true })

    await entrarComo(page, 'auxiliar')
    await page.goto('/wms/bajas/nueva')
    await expect(page.getByTestId('bajas-sin-permiso')).toBeVisible()
    await page.goto('/wms/bajas')
    await expect(page.getByTestId('nueva-baja')).toHaveCount(0)
  })

  test('lo vencido: Charlie pide la baja, Dirección Técnica confirma el vencimiento y autoriza, se emite la Orden LS-FR.56.01 y se traslada a Bajas', async ({ page }, info) => {
    await entrarComo(page, 'jefe_almacen')
    await page.goto('/wms/bajas/nueva')
    await buscarYAgregar(page, 'L-VENCIDO', 'L-VENCIDO')
    await expect(page.getByTestId('motivo-baja')).toHaveValue('VENCIDO')                  // lo vencido ya viene con su motivo
    await page.getByTestId('cantidad-baja').fill('10')
    await expect(page.getByTestId('solicitar-baja')).toBeEnabled()
    await sinDesborde(page)
    await capturar(page, info, 'bajas-nueva-con-linea', { completa: true })
    await page.getByTestId('solicitar-baja').click()

    await expect(page.getByTestId('numero-baja')).toContainText(/BJ-\d{4}-\d{5}/)
    const numero = (await page.getByTestId('numero-baja').textContent())!.trim()
    await expect(page.getByTestId('aviso-baja-ok')).toContainText(`Baja ${numero} solicitada. Siguiente:`)
    await expect(page.getByTestId('siguiente-paso-baja')).toContainText('Completar el sustento de 1 línea')
    await expect(page.getByTestId('sustento-linea')).toContainText('Dirección Técnica debe confirmar la fecha de vencimiento')
    await expect(page.getByTestId('confirmar-vencimiento')).toHaveCount(0)               // Charlie no confirma
    await expect(page.getByTestId('autorizar-baja')).toHaveCount(0)
    await sinDesborde(page)
    await capturar(page, info, 'bajas-detalle-solicitada', { completa: true })
    const url = page.url().split('?')[0]

    await entrarComo(page, 'direccion_tecnica')
    await page.goto(url)
    await expect(page.getByTestId('autorizar-baja')).toBeDisabled()
    await expect(page.getByTestId('falta-sustento-baja')).toContainText('Todavía no se puede autorizar')
    await page.getByTestId('confirmar-vencimiento').click()
    await expect(page.getByTestId('aviso-baja-ok')).toContainText('Vencimiento confirmado. Siguiente:')
    await expect(page.getByTestId('sustento-linea')).toContainText('Sustento completo')
    await expect(page.getByTestId('autorizar-baja')).toBeEnabled()
    await page.getByTestId('autorizar-baja').click()
    await expect(page.getByTestId('aviso-baja-ok')).toContainText(`Baja ${numero} autorizada y Orden de Baja emitida. Siguiente:`)
    await expect(page.getByTestId('chip-estado-baja')).toContainText('Emitida')
    await expect(page.getByTestId('siguiente-paso-baja')).toContainText('Llevar las unidades al área de Bajas')
    await sinDesborde(page)
    await capturar(page, info, 'bajas-orden-emitida', { completa: true })

    // el PDF de la Orden: el documento LS-FR.56.01
    const pdf = await page.request.get(`${url}/pdf`)
    expect(pdf.status()).toBe(200)
    expect(pdf.headers()['content-type']).toContain('application/pdf')
    expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-')
    await expect(page.getByTestId('pdf-orden-baja')).toHaveAttribute('href', /\/pdf$/)

    // el traslado físico lo registra el almacén
    await entrarComo(page, 'jefe_almacen')
    await page.goto(url)
    await expect(page.getByTestId('trasladar-baja')).toBeEnabled()
    await sinDesborde(page)
    await page.getByTestId('trasladar-baja').click()
    await expect(page.getByTestId('aviso-baja-ok')).toContainText('Traslado registrado')
    await expect(page.getByTestId('ver-traslado')).toBeVisible()
    await expect(page.getByTestId('chip-estado-baja')).toContainText('Emitida')

    await page.goto('/wms/bajas?ver=emitidas')
    await expect(page.getByTestId('fila-baja').filter({ hasText: numero })).toBeVisible()
    await expect(page.getByTestId('stock-en-bajas')).toContainText('L-VENCIDO')
    await sinDesborde(page)
    await capturar(page, info, 'bajas-lista-emitidas', { completa: true })
  })

  test('daño y alerta de DIGEMID: la asistente reúne el sustento (evaluación y archivo), Dirección Técnica rechaza una y autoriza otra; la Orden emitida se anula y se reemite', async ({ page }, info) => {
    await entrarComo(page, 'asistente_dt')
    await page.goto('/wms/bajas/nueva')
    await elegirPropietario(page, 'DIPHASAC')
    await buscarYAgregar(page, 'L2425', 'L2425')
    await buscarYAgregar(page, 'L2428', 'L2428')
    await page.getByTestId('cantidad-baja').nth(0).fill('5')
    await page.getByTestId('cantidad-baja').nth(1).fill('3')
    await page.getByTestId('motivo-baja').nth(0).selectOption('DETERIORO_DANO')
    await page.getByTestId('motivo-baja').nth(1).selectOption('ALERTA_DIGEMID')
    await page.getByTestId('solicitar-baja').click()
    await expect(page.getByTestId('numero-baja')).toContainText(/BJ-/)
    const numero = (await page.getByTestId('numero-baja').textContent())!.trim()
    const url = page.url().split('?')[0]
    await expect(page.getByTestId('sustento-linea')).toHaveCount(2)

    // evaluación tipo acta organoléptica (línea 1)
    await page.getByTestId('abrir-evaluacion').click()
    await expect(page.getByTestId('eval-guardar')).toBeDisabled()
    await expect(page.getByTestId('eval-faltan')).toContainText('Marca el material del envase')
    await page.getByRole('checkbox', { name: 'Envase de plástico' }).click()
    await page.getByRole('radiogroup', { name: 'Cerrado' }).first().getByRole('radio', { name: 'No conforme' }).click()
    await page.getByTestId('eval-marcar-conformes').click()
    await page.getByTestId('eval-observacion').fill('Cajas mojadas por goteo; envase con humedad')
    await expect(page.getByTestId('eval-conclusion-NO_CONFORME')).toHaveAttribute('aria-checked', 'true')
    await sinDesborde(page)
    await capturar(page, info, 'bajas-evaluacion-dano', { completa: true })
    await page.getByRole('radiogroup', { name: 'Trae certificado de análisis o protocolo analítico' }).getByRole('radio', { name: 'Sí' }).click()
    await expect(page.getByTestId('eval-guardar')).toBeEnabled()
    await page.getByTestId('eval-guardar').click()
    await expect(page.getByTestId('aviso-baja-ok')).toContainText('Evaluación guardada. Siguiente:')

    // la alerta de DIGEMID (línea 2): primero un archivo que no sirve, luego el PDF
    await page.getByTestId('abrir-adjuntar').click()
    await page.getByTestId('archivo-sustento').setInputFiles({ name: 'hoja.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from('x') })
    await page.getByTestId('adjuntar-sustento').click()
    await expect(page.getByText('El archivo debe ser un PDF o una imagen')).toBeVisible()
    await page.getByTestId('archivo-sustento').setInputFiles({ name: 'alerta-digemid-045.pdf', mimeType: 'application/pdf', buffer: PDF_MINIMO })
    await page.getByTestId('adjuntar-sustento').click()
    await expect(page.getByTestId('aviso-baja-ok')).toContainText('Archivo adjuntado. Siguiente:')
    await expect(page.getByTestId('ver-sustento')).toContainText('alerta-digemid-045.pdf')
    await expect(page.getByTestId('sustento-linea').filter({ hasText: 'Sustento completo' })).toHaveCount(2)
    await sinDesborde(page)
    await capturar(page, info, 'bajas-detalle-con-sustento', { completa: true })

    // Dirección Técnica: rechazar pide motivo; luego autoriza
    await entrarComo(page, 'direccion_tecnica')
    await page.goto(url)
    await page.getByTestId('rechazar-baja-abrir').click()
    await expect(page.getByTestId('rechazar-baja-confirmar')).toBeDisabled()
    await page.getByTestId('rechazar-baja-motivo').fill('Primero hay que reponer la evaluación con fotos')
    await sinDesborde(page)
    await capturar(page, info, 'bajas-rechazar-motivo', { completa: true })
    await page.getByTestId('rechazar-baja-confirmar').click()
    await expect(page.getByTestId('aviso-baja-ok')).toContainText('Baja rechazada. Quien la pidió ve tu motivo')
    await expect(page.getByTestId('chip-estado-baja')).toContainText('Rechazada')
    await expect(page.getByTestId('autorizar-baja')).toHaveCount(0)

    // otra solicitud igual, ahora autorizada, y la Orden emitida se anula con motivo y se reemite
    await page.goto('/wms/bajas/nueva')
    await elegirPropietario(page, 'DIPHASAC')
    await buscarYAgregar(page, 'L2610', 'L2610')
    await page.getByTestId('cantidad-baja').fill('2')
    await page.getByTestId('motivo-baja').selectOption('OBSERVACION_PROVEEDOR')
    await page.getByTestId('solicitar-baja').click()
    await expect(page.getByTestId('numero-baja')).toContainText(/BJ-/)
    const url2 = page.url().split('?')[0]
    await page.getByTestId('abrir-adjuntar').click()
    await page.getByTestId('archivo-sustento').setInputFiles({ name: 'carta-proveedor.pdf', mimeType: 'application/pdf', buffer: PDF_MINIMO })
    await page.getByTestId('adjuntar-sustento').click()
    await expect(page.getByTestId('aviso-baja-ok')).toContainText('Archivo adjuntado')
    await page.getByTestId('autorizar-baja').click()
    await expect(page.getByTestId('chip-estado-baja')).toContainText('Emitida')

    await page.getByTestId('anular-orden-abrir').click()
    await page.getByTestId('anular-orden-motivo').fill('El número de lote salió mal escrito')
    await page.getByTestId('anular-orden-confirmar').click()
    await expect(page.getByTestId('aviso-baja-ok')).toContainText('Orden anulada. El stock sigue en Bajas')
    await expect(page.getByTestId('chip-estado-baja')).toContainText('Anulada')
    await sinDesborde(page)
    await capturar(page, info, 'bajas-orden-anulada', { completa: true })
    await page.getByTestId('reemitir-orden').click()
    await expect(page.getByTestId('aviso-baja-ok')).toContainText('Orden reemitida como BJ-')
    await expect(page.getByTestId('chip-estado-baja')).toContainText('Emitida')
    await page.goto(url2)
    await expect(page.getByText(/Se reemitió como/)).toBeVisible()

    await page.goto('/wms/bajas?ver=cerradas')
    await expect(page.getByTestId('fila-baja').filter({ hasText: numero })).toBeVisible()
  })

  test('las alertas llevan a las bajas: el lote vencido que sigue en el inventario → «dar de baja» con la búsqueda lista; la baja por trasladar → la lista', async ({ page }, info) => {
    await entrarComo(page, 'direccion_tecnica')
    await page.goto('/wms/alertas')
    const dar = page.getByTestId('alerta-dar-de-baja').first()
    await expect(dar).toBeVisible()
    await sinDesborde(page)
    await dar.click()
    await expect(page.getByRole('heading', { name: 'Nueva baja', level: 1 })).toBeVisible()
    await expect(page.getByTestId('buscar-stock-baja')).toHaveValue('L-VENCIDO')
    await expect(page.getByTestId('resultado-stock-baja').first()).toContainText('Vencido')

    await entrarComo(page, 'jefe_almacen')
    await page.goto('/wms/alertas')
    await expect(page.getByTestId('alerta-ver-bajas').first()).toBeVisible()
    await page.getByTestId('alerta-ver-bajas').first().click()
    await expect(page.getByRole('heading', { name: 'Bajas', level: 1 })).toBeVisible()
    await expect(page.getByTestId('lista-bajas')).toBeVisible()
    await sinDesborde(page)
    await capturar(page, info, 'bajas-por-trasladar', { completa: true })
  })
})
