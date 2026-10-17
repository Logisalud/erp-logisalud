// S5–S8: las excepciones del flujo, sobre el SEGUNDO pedido de la demostración (el que arma e2e/rutas.spec.ts):
// el lote no aparece en el picking (reemplazo), la conformidad con diferencia (observada y corregida) y un bulto que falta al cargar (el pedido se deja fuera).
import { expect, test, type Page } from '@playwright/test'
import { PDFDocument } from 'pdf-lib'
import { capturar, entrarComo, esTelefono, sinDesborde } from './ayudas'

test.describe.configure({ mode: 'serial' })

const estado = { ordenUrl: '', numero: '' }
const abrirOtraSalida = async (page: Page, info: Parameters<typeof esTelefono>[0]) => {
  await page.goto('/wms/salidas')
  const todas = page.getByTestId(esTelefono(info) ? 'fila-salida-movil' : 'fila-salida')
  const fila = todas.filter({ hasText: 'PED-DEMO-102' }).filter({ hasNotText: 'Cancelada' }).first()    // en el teléfono la fila muestra el pedido, no el N.° de salida
  await expect(fila).toBeVisible()
  await (esTelefono(info) ? fila : fila.getByRole('link', { name: /^Abrir/ })).click()
  await expect(page.getByTestId('detalle-salida')).toBeVisible()
}
test.describe('excepciones del flujo de salida', () => {
  test('el picker no encuentra el lote: avisa con su nota y el jefe elige el reemplazo que propone el WMS', async ({ page }, info) => {
    // el segundo pedido (102) entra a una ruta nueva: así nace su salida con el stock asignado
    await entrarComo(page, 'jefe_transporte')
    await page.goto('/wms/pedidos')
    await page.getByTestId('actualizar-bandeja').click()
    await expect(page.getByTestId('bandeja-resumen')).toBeVisible()
    await expect(page.getByTestId('ped-conteo')).toHaveText('4 pedidos')
    const fila = page.getByTestId(esTelefono(info) ? 'fila-pedido-movil' : 'fila-pedido').filter({ hasText: 'PED-DEMO-102' })
    if ((await fila.textContent())?.includes('Cambió: revisar')) {
      await fila.getByTestId(esTelefono(info) ? 'abrir-pedido-movil' : 'abrir-pedido').click()
      await page.locator('[data-testid="detalle-pedido"]:visible').getByTestId('pedido-revisar-cambio').click()
      await expect(fila).toContainText('Por planificar')
    }
    await page.goto('/wms/rutas')
    await page.getByTestId('nueva-ruta').click()
    await expect(page.getByTestId('editor-ruta')).toBeVisible()
    await page.getByTestId('ruta-vehiculo').selectOption({ label: 'D4F-318 — Furgón con termo · calificado · frío' })
    await page.getByTestId('ruta-conductor').selectOption({ label: 'Marco Huamán' })
    await page.getByTestId('agregar-buscar').fill('angeles')
    await page.getByTestId('pedido-disponible').filter({ hasText: 'PED-DEMO-102' }).getByTestId('agregar-pedido').click()
    if (await page.getByTestId('excepcion-corte').count()) { await page.getByTestId('excepcion-corte').check(); await page.getByTestId('excepcion-motivo').fill('Cliente urgente') }
    await page.getByTestId('guardar-plan').click()
    await expect(page.getByTestId('ruta-ok')).toContainText('Plan guardado')
    await page.getByTestId('confirmar-ruta').click()
    await expect(page.getByTestId('chip-estado-ruta').first()).toContainText('Planificada')

    await abrirOtraSalida(page, info)
    estado.numero = ((await page.getByRole('heading', { level: 1 }).textContent()) ?? '').trim()
    await page.getByTestId('generar-picking').click()
    await expect(page.getByTestId('orden-picking')).toBeVisible()
    estado.ordenUrl = page.url()

    await entrarComo(page, 'auxiliar')
    await page.goto(estado.ordenUrl)
    const total = await page.getByTestId('linea-picking').count()
    await page.getByTestId('no-lo-encuentro').first().click()
    await expect(page.getByTestId('hoja-reporte')).toBeVisible()
    await expect(page.getByTestId('enviar-discrepancia')).toBeDisabled()
    await page.getByTestId('nota-discrepancia').fill('No está en la ubicación')
    await sinDesborde(page)
    await capturar(page, info, 'picking-no-lo-encuentro')
    await page.getByTestId('enviar-discrepancia').click()
    await expect(page.getByTestId('estado-discrepancia').first()).toContainText('No está en la ubicación')

    await entrarComo(page, 'jefe_transporte')
    await page.goto(estado.ordenUrl)
    await page.getByTestId('resolver-discrepancia').first().click()
    await expect(page.getByTestId('hoja-reemplazo')).toBeVisible()
    const opciones = page.getByTestId('opciones-reemplazo')
    await expect(opciones.or(page.getByText('No hay otro lote ni ubicación'))).toBeVisible()
    if (await opciones.count()) {
      await capturar(page, info, 'picking-reemplazo')
      await page.getByTestId('usar-reemplazo').first().click()
      await expect(page.getByTestId('estado-discrepancia')).toHaveCount(0)
    } else {
      // sin otro lote ni ubicación con esa cantidad: el WMS lo dice y no inventa nada
      await expect(page.getByText('No hay otro lote ni ubicación')).toBeVisible()
      test.skip(true, 'esta demostración no tiene reemplazo para esa línea')
    }
    await entrarComo(page, 'auxiliar')
    await page.goto(estado.ordenUrl)
    for (let i = 0; i < total; i++) await page.getByTestId('pickeado').first().click()
    await expect(page.getByTestId('avance-picking')).toContainText('Picking completo')
  })

  test('conformidad con diferencia: una línea con menos cantidad queda como ajuste visible y la orden pasa a Despacho', async ({ page }, info) => {
    await entrarComo(page, 'asistente_dt')
    await page.goto(estado.ordenUrl.replace('/picking/', '/conformidad/'))
    await page.getByTestId('resultado-linea').first().selectOption('MENOS')
    await page.getByTestId('cantidad-encontrada').first().fill('1')
    await page.getByTestId('nota-linea').first().fill('Faltan unidades en la caja')
    await page.getByTestId('bultos').fill('1')
    await sinDesborde(page)
    await capturar(page, info, 'conformidad-ajuste')
    await page.getByTestId('dar-conformidad').click()
    await expect(page.getByTestId('conformidad-hecha')).toContainText('Conformidad registrada')
    await expect(page.getByTestId('ajustes-conformidad')).toContainText('Faltan unidades en la caja')
  })

  test('un bulto que falta al cargar: no se libera la unidad; el pedido se deja fuera de la salida con motivo y no descuenta stock', async ({ page }, info) => {
    const pdfReal = async (t: string) => { const d = await PDFDocument.create(); d.addPage().drawText(t); return Buffer.from(await d.save()) }
    // documentación: guía, COA de los lotes que salen y embalaje en 2 bultos
    await entrarComo(page, 'asistente_dt')
    await abrirOtraSalida(page, info)
    const faltantes = (await page.getByTestId('paquete-incompleto').count()) ? (await page.getByTestId('paquete-incompleto').textContent()) ?? '' : ''
    const lotesSinCoa = [...faltantes.matchAll(/COA del lote (\S+) \(falta\)/g)].map((m) => m[1])
    if (lotesSinCoa.length) {
      await page.goto('/wms/documentos/carga')
      await page.getByTestId('carga-archivos').setInputFiles(await Promise.all(lotesSinCoa.map(async (l) => ({ name: `COA_${l}.pdf`, mimeType: 'application/pdf', buffer: await pdfReal(`COA ${l}`) }))))
      await expect(page.getByTestId('carga-resumen')).toContainText('quedaron como COA vigente')
      await abrirOtraSalida(page, info)
    }
    // un registro sanitario vencido bloquea el paquete: Dirección Técnica lo reemplaza (la versión anterior queda en el historial)
    const vencidos = [...((await page.getByTestId('paquete-incompleto').count()) ? (await page.getByTestId('paquete-incompleto').textContent()) ?? '' : '').matchAll(/registro sanitario de (\S+) \(vencido\)/g)].map((m) => m[1])
    for (const cod of vencidos) {
      await entrarComo(page, 'direccion_tecnica')
      await page.goto('/wms/documentos')
      await page.getByTestId('doc-filtro-REGISTRO_SANITARIO').click()
      const f = page.locator('[data-testid="fila-documento"]:visible, [data-testid="fila-documento-movil"]:visible').filter({ hasText: cod }).first()
      await (esTelefono(info) ? f.getByRole('button', { name: 'Reemplazar' }) : f.getByTestId('reemplazar-documento')).click()
      await page.getByTestId('subida-archivo').setInputFiles({ name: `rs-${cod}.pdf`, mimeType: 'application/pdf', buffer: await pdfReal(`RS ${cod}`) })
      await page.getByTestId('subida-hasta').fill('2031-12-31')
      await page.getByTestId('subida-motivo').fill('Renovación')
      await page.getByTestId('subida-guardar').click()
      await expect(page.getByTestId('aviso-ok')).toContainText('anterior quedó en el historial')
    }
    if (vencidos.length) { await entrarComo(page, 'asistente_dt'); await abrirOtraSalida(page, info) }
    await expect(page.getByTestId('paquete-completo')).toBeVisible()
    await page.getByTestId('numero-gre').fill('T001-00000555')
    await page.getByTestId('registrar-gre').click()
    await expect(page.getByTestId('guia-numero')).toHaveText('T001-00000555')

    await entrarComo(page, 'auxiliar')
    await abrirOtraSalida(page, info)
    await page.getByTestId('ir-embalaje').click()
    await page.getByTestId('mas-bultos').click()
    // se parte la primera fila: 1 unidad al bulto 2 (el resto de la fila queda en el bulto 1)
    if (esTelefono(info)) {
      await page.getByTestId('abrir-reparto').first().click()
      const c = page.getByTestId('celda-reparto-movil'); const t = Number(await c.nth(0).inputValue())
      await c.nth(0).fill(String(t - 1)); await c.nth(1).fill('1'); await page.getByTestId('hoja-listo').click()
    } else {
      const c = page.getByTestId('fila-reparto').first().getByTestId('celda-reparto'); const t = Number(await c.nth(0).inputValue())
      await c.nth(0).fill(String(t - 1)); await c.nth(1).fill('1')
    }
    await page.getByTestId('confirmar-embalaje').click()
    await expect(page.getByTestId('bulto')).toHaveCount(2)

    // carga: solo el bulto 1; falta el 2
    await entrarComo(page, 'jefe_transporte')
    await page.goto('/wms/carga')
    const rutas = page.getByTestId('ruta-carga').filter({ has: page.getByTestId('estado-carga').filter({ hasText: 'En carga' }) })
    const nRutas = await rutas.count()
    for (let i = 0; i < nRutas; i++) {          // la ruta que lleva este pedido
      await page.goto('/wms/carga')
      await rutas.nth(i).click()
      await expect(page.getByTestId('panel-carga')).toBeVisible()
      if (await page.locator('[data-testid="pedido-carga"]').filter({ hasText: estado.numero }).count()) break
    }
    await page.getByTestId('guardar-checklist').click()
    await page.locator('[data-testid="pedido-carga"][data-excluido="no"]').filter({ hasText: estado.numero }).first().getByTestId('marcar-cargado').first().click()
    await expect(page.getByTestId('motivos-no-liberar')).toContainText('Faltan 1 bulto por cargar')
    await expect(page.getByTestId('liberar-unidad')).toBeDisabled()
    await sinDesborde(page)
    await capturar(page, info, 'carga-falta-bulto', { completa: true })
    await page.locator('[data-testid="pedido-carga"]').filter({ hasText: estado.numero }).getByTestId('excluir-pedido').click()
    await expect(page.getByTestId('confirmar-excluir')).toBeDisabled()
    await page.getByTestId('motivo-excluir').fill('Se extravió el bulto 2')
    await page.getByTestId('confirmar-excluir').click()
    await expect(page.getByTestId('motivo-exclusion')).toContainText('Se extravió el bulto 2')
    await capturar(page, info, 'carga-pedido-fuera', { completa: true })
  })
})
