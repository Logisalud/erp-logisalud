// OS-7 (respuestas de Dirección Técnica, 2026-10-17): carga inicial como cambio de sistema y cambios del LS-FR.43.03 (impresión, escaneo firmado, cierre con data logger).
// Corre al final: la ruta ya salió en salidas.spec.ts y la carga inicial agrega lotes al inventario de prueba.
import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { capturar, elegirProductoKardex, entrarComo, esTelefono, sinDesborde } from './ayudas'

test.describe.configure({ mode: 'serial' })

const CABECERA = 'producto;lote;vence;propietario;posicion;estado;cantidad'
const FILAS_BIEN = [
  'DEMO-002;OS7-APR;31/12/2029;LOGISSA;B-5;Aprobados;24',
  'DEMO-003;OS7-BAJ;31/12/2029;LOGISSA;E-8.1.2;Bajas;3',
  'DEMO-001;OS7-CUA;31/12/2029;LOGISSA;A-6;Cuarentena;40',
]
const FILAS_MAL = ['DEMO-002;;31/12/2029;LOGISSA;B-5;Aprobados;24', 'DEMO-003;OS7-X;;LOGISSA;B-6;Aprobados;5']

test.describe('carga inicial como cambio de sistema (OS-7)', () => {
  test('Administración sube y revisa (lote y vencimiento obligatorios); Dirección Técnica valida con UNA sola confirmación; el Kardex y la historia muestran el recorrido', async ({ page }, info) => {
    await entrarComo(page, 'admin_wms')
    await page.goto('/wms/carga-inicial')
    await expect(page.getByTestId('como-entra-carga')).toContainText('no hace falta acta organoléptica')
    await expect(page.getByTestId('sin-cargas')).toBeVisible()
    await sinDesborde(page)
    await capturar(page, info, 'carga-inicial-vacia', { completa: true })
    // errores: sin código de lote y sin vencimiento
    await page.getByTestId('texto-carga').fill([CABECERA, ...FILAS_MAL].join('\n'))
    await page.getByTestId('revisar-carga').click()
    await expect(page.getByTestId('carga-con-errores')).toBeVisible()
    await expect(page.getByTestId('fila-previa').nth(0)).toContainText('código de lote')
    await expect(page.getByTestId('fila-previa').nth(1)).toContainText('fecha de vencimiento')
    await expect(page.getByTestId('guardar-carga')).toBeDisabled()
    await sinDesborde(page)
    await capturar(page, info, 'carga-inicial-errores', { completa: true })
    // la carga buena
    await page.getByTestId('texto-carga').fill([CABECERA, ...FILAS_BIEN].join('\n'))
    await page.getByTestId('revisar-carga').click()
    await expect(page.getByTestId('carga-sin-errores')).toContainText('24 aprobadas, 40 en cuarentena, 3 a bajas')
    await sinDesborde(page)
    await capturar(page, info, 'carga-inicial-lista', { completa: true })
    await page.getByTestId('guardar-carga').click()
    await expect(page.getByText('Carga guardada como borrador')).toContainText('avisa a Dirección Técnica')
    // Administración no confirma: la valida Dirección Técnica
    await expect(page.getByTestId('confirmar-carga')).toHaveCount(0)
    await expect(page.getByTestId('espera-confirmacion')).toBeVisible()
    await capturar(page, info, 'carga-inicial-borrador', { completa: true })
    // UNA sola confirmación de Dirección Técnica
    await entrarComo(page, 'direccion_tecnica')
    await page.goto('/wms/carga-inicial')
    await page.getByTestId('confirmar-carga').click()
    await expect(page.getByTestId('carga-confirmada')).toContainText('sin acta organoléptica')
    await expect(page.getByTestId('lista-cargas')).toContainText('Confirmada')
    await expect(page.getByTestId('confirmar-carga')).toHaveCount(0)
    await sinDesborde(page)
    await capturar(page, info, 'carga-inicial-confirmada', { completa: true })
    // el Kardex lo cuenta como carga inicial y explica el recorrido
    await page.goto('/wms/kardex')
    await elegirProductoKardex(page, 'DEMO-002')
    await page.getByTestId('ver-kardex').click()
    await expect(page.getByTestId('kardex-saldo-final')).toBeVisible()
    await page.locator('#k-lote').selectOption({ label: 'OS7-APR' })
    await page.getByTestId('ver-kardex').click()
    await expect(page.getByTestId('kardex-saldo-final')).toHaveText('24')
    await expect(page.getByTestId('nota-carga-inicial')).toContainText('sin acta organoléptica')
    await sinDesborde(page)
    await capturar(page, info, 'kardex-carga-inicial', { completa: true })
    // la historia del lote: ingreso en Cuarentena → liberación → ubicación final
    await page.getByTestId('historia-del-lote').click()
    const pasos = page.getByTestId('paso-carga-inicial')
    await expect(pasos.first()).toContainText('paso 1 de 3 · Ingreso por carga inicial en Cuarentena')
    await expect(pasos.filter({ hasText: 'Liberación' }).first()).toContainText('paso 2 de 3')
    await expect(pasos.last()).toContainText('paso 3 de 3 · Ubicación final')
    await expect(page.getByTestId('fila-historia')).toHaveCount(5)
    await sinDesborde(page)
    await capturar(page, info, 'lote-recorrido-carga-inicial', { completa: true })
  })

  test('quien no administra ni decide no ve la carga inicial', async ({ page }) => {
    await entrarComo(page, 'auxiliar')
    await page.goto('/wms/carga-inicial')
    await expect(page).toHaveURL(/\/wms\/?$/)
  })
})

async function abrirRutaEnCurso(page: Page, info: TestInfo) {
  await page.goto('/wms/rutas')
  const fila = page.getByTestId(esTelefono(info) ? 'fila-ruta-movil' : 'fila-ruta').filter({ hasText: 'RUT-2026-00001' })
  await (esTelefono(info) ? fila : fila.getByRole('link', { name: /^Abrir/ })).click()
  await expect(page.getByTestId('lsfr-panel')).toBeVisible()
}
const logger = (nombre = 'GSP6_ruta.csv') => ({ name: nombre, mimeType: 'text/csv', buffer: Buffer.from('fecha,temperatura\n2026-10-15 08:00,18.1\n2026-10-15 11:00,21.4\n') })
const pdfFirmado = { name: 'LS-FR-43-03_firmado.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n% escaneo de prueba\n%%EOF\n') }

test.describe('LS-FR.43.03: impresión, escaneo firmado y cierre de la ruta (OS-7)', () => {
  test('la copia se imprime y queda registrada; el escaneo firmado se sube y se conserva 5 años; cambiarlo pide motivo y deja el anterior', async ({ page }, info) => {
    await entrarComo(page, 'jefe_transporte')
    await abrirRutaEnCurso(page, info)
    await expect(page.getByTestId('lsfr-panel')).toContainText('usuario:')
    await expect(page.getByTestId('paso-impresion')).toContainText('Sin imprimir')
    await expect(page.getByTestId('cierre-aun-no')).toHaveCount(0)
    // imprimir: se registra quién y cuándo (se abre el PDF en otra pestaña)
    const [popup] = await Promise.all([page.waitForEvent('popup'), page.getByTestId('imprimir-lsfr').click()])
    await expect(page.getByTestId('impresion-ok')).toContainText('Impresión registrada')
    await expect(page.getByTestId('paso-impresion')).toContainText('Impresa una vez')
    await expect(page.getByTestId('impresion-ultima')).toContainText('después de la salida')
    await popup.close()
    // escaneo firmado
    await expect(page.getByTestId('paso-escaneo')).toContainText('Falta subirlo')
    await page.getByTestId('escaneo-archivo').setInputFiles({ name: 'firmado.docx', mimeType: 'application/msword', buffer: Buffer.from('x') })
    await page.getByTestId('escaneo-subir').click()
    await expect(page.getByTestId('form-escaneo').getByRole('alert')).toContainText('PDF, JPG o PNG')
    await page.getByTestId('escaneo-archivo').setInputFiles(pdfFirmado)
    await page.getByTestId('escaneo-subir').click()
    await expect(page.getByTestId('escaneo-ok')).toContainText('Escaneo subido')
    await expect(page.getByTestId('escaneo-actual')).toContainText('LS-FR-43-03_firmado.pdf')
    await expect(page.getByTestId('escaneo-conservacion')).toContainText('Se conserva 5 años')
    const r = await page.request.get((await page.getByTestId('escaneo-actual').getByRole('link').getAttribute('href'))!)
    expect(r.status()).toBe(200)
    expect((await r.body()).subarray(0, 4).toString()).toBe('%PDF')
    // cambiarlo: motivo obligatorio
    await page.getByTestId('cambiar-escaneo').click()
    await expect(page.getByTestId('escaneo-motivo')).toBeVisible()
    await page.getByTestId('escaneo-archivo').setInputFiles({ ...pdfFirmado, name: 'LS-FR-43-03_firmado_v2.pdf', buffer: Buffer.from('%PDF-1.4\n% v2\n%%EOF\n') })
    await page.getByTestId('escaneo-motivo').fill('Faltaba la firma del conductor')
    await page.getByTestId('escaneo-subir').click()
    await expect(page.getByTestId('escaneo-actual')).toContainText('firmado_v2.pdf')
    await page.getByTestId('escaneo-historial').locator('summary').click()
    await expect(page.getByTestId('escaneo-historial')).toContainText('LS-FR-43-03_firmado.pdf')
    await sinDesborde(page)
    await capturar(page, info, 'rutas-lsfr-escaneo', { completa: true })
  })

  test('cerrar la ruta: el archivo del data logger y la mínima y la máxima; fuera del rango del formato se marca; corregir el cierre pide motivo y deja la versión anterior', async ({ page }, info) => {
    // quien no es Jefe de Transporte no cierra
    await entrarComo(page, 'reemplazante_jefe')
    await abrirRutaEnCurso(page, info)
    await expect(page.getByTestId('cierre-solo-jt')).toBeVisible()
    await expect(page.getByTestId('cerrar-ruta')).toHaveCount(0)

    await entrarComo(page, 'jefe_transporte')
    await abrirRutaEnCurso(page, info)
    await expect(page.getByTestId('form-cierre')).toBeVisible()
    await sinDesborde(page)
    await capturar(page, info, 'rutas-lsfr-cierre-form', { completa: true })
    // la mínima no puede pasar de la máxima
    await page.getByTestId('cierre-archivo').setInputFiles(logger())
    await page.getByTestId('cierre-min').fill('24')
    await page.getByTestId('cierre-max').fill('18')
    await page.getByTestId('cerrar-ruta').click()
    await expect(page.getByText('La temperatura mínima no puede ser mayor que la máxima.')).toBeVisible()
    // fuera del rango del formato (15 – 25 °C): se marca, no bloquea
    await page.getByTestId('cierre-min').fill('12,5')
    await page.getByTestId('cierre-max').fill('27')
    await page.getByTestId('cierre-obs').fill('Se abrió la puerta en el tercer cliente')
    await page.getByTestId('cerrar-ruta').click()
    await expect(page.getByTestId('cierre-ok')).toContainText('salió del rango del formato')
    await expect(page.getByTestId('cierre-chip')).toContainText('12,5 – 27,0 °C')
    await expect(page.getByTestId('cierre-fuera-de-rango')).toContainText('15 °C – 25 °C')
    await expect(page.getByTestId('cierre-datos')).toContainText('GSP6_ruta.csv')
    await expect(page.getByTestId('form-cierre')).toHaveCount(0)
    const arch = await page.request.get((await page.getByTestId('cierre-archivo').getAttribute('href'))!)
    expect(arch.status()).toBe(200)
    expect(arch.headers()['content-disposition']).toContain('attachment')
    expect((await arch.body()).toString()).toContain('temperatura')
    await sinDesborde(page)
    await capturar(page, info, 'rutas-lsfr-cerrada', { completa: true })
    // el PDF del formato lleva la temperatura registrada
    const pdf = await page.request.get((await page.getByTestId('ver-lsfr').getAttribute('href'))!)
    expect(pdf.status()).toBe(200)
    expect((await pdf.body()).subarray(0, 4).toString()).toBe('%PDF')
    // corregir el cierre: motivo obligatorio y la versión anterior queda
    await page.getByTestId('corregir-cierre').click()
    await page.getByTestId('corr-archivo').setInputFiles(logger('GSP6_ruta_corregido.csv'))
    await page.getByTestId('corr-min').fill('16')
    await page.getByTestId('corr-max').fill('24,5')
    await page.getByTestId('corr-guardar').click()
    await expect(page.getByTestId('form-correccion')).toBeVisible()
    await page.getByTestId('corr-motivo').fill('Era el archivo de otro viaje')
    await page.getByTestId('corr-guardar').click()
    await expect(page.getByTestId('correccion-ok')).toContainText('Cierre corregido')
    await expect(page.getByTestId('cierre-chip')).toContainText('16,0 – 24,5 °C')
    await expect(page.getByTestId('cierre-fuera-de-rango')).toHaveCount(0)
    await page.getByTestId('cierre-historial').locator('summary').click()
    await expect(page.getByTestId('cierre-historial')).toContainText('12,5 – 27,0 °C')
    await expect(page.getByTestId('paso-escaneo')).toContainText('Subido')
  })
})
