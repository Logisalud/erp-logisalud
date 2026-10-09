// Batch 3b: revisión diaria, programación de los conteos semanales, reportes y ubicación en conteo bloqueada, en los 4 viewports.
import { expect, test, type Page } from '@playwright/test'
import { capturar, entrarComo, esTelefono, sinDesborde } from './ayudas'

test.describe.configure({ mode: 'serial' })

async function cambiarRol(page: Page, rol: Parameters<typeof entrarComo>[1]) {
  await page.getByTestId('cambiar-rol-demo').selectOption(rol)
  await page.waitForTimeout(400)
  await page.reload()
  await expect(page.getByTestId('banner-demo')).toBeVisible()
}

test.describe('revisión diaria (INV-04)', () => {
  test('el Jefe hace el recorrido de 4 focos: solo anota pendientes, cada uno con responsable; no cierra con focos sin revisar', async ({ page }, info) => {
    await entrarComo(page, 'jefe_almacen')
    await page.goto('/wms/revision-diaria')
    await expect(page.getByTestId('revision-sin-empezar')).toBeVisible()
    await capturar(page, info, 'revision-diaria-inicio', { completa: true })
    // los pendientes de ayer siguen visibles hasta verificarse
    await expect(page.getByTestId('pendiente')).toHaveCount(2)
    await page.getByTestId('solo-importantes').click()
    await expect(page.getByTestId('pendiente')).toHaveCount(1) // solo el crítico
    await page.getByTestId('solo-importantes').click()

    await page.getByTestId('iniciar-revision').click()
    await expect(page.getByTestId('focos')).toBeVisible()
    await expect(page.getByTestId('foco')).toHaveCount(4)
    await expect(page.getByTestId('cerrar-revision')).toBeDisabled()
    await expect(page.getByTestId('motivo-no-cierra')).toContainText('Falta revisar')

    // un pendiente sin responsable no se puede guardar
    const orden = page.locator('[data-foco="ORDEN"]')
    await orden.getByTestId('foco-agregar-pendiente').click()
    await page.getByTestId('pendiente-descripcion').fill('Cajas vacías frente al rack C-2')
    await expect(page.getByTestId('pendiente-guardar')).toBeDisabled()
    await page.getByTestId('pendiente-responsable').selectOption({ label: 'Auxiliar de almacén (demo)' })
    await page.getByTestId('pendiente-ubicacion').fill('C-2')
    await page.getByTestId('pendiente-afecta').check()
    await capturar(page, info, 'revision-diaria-pendiente', { completa: true })
    await page.getByTestId('pendiente-guardar').click()
    await expect(orden.getByTestId('resultado-foco')).toHaveText(/Con pendientes/)
    // un foco con pendientes abiertos no queda «sin problemas»
    await expect(orden.getByTestId('foco-sin-problemas')).toBeDisabled()
    for (const f of ['LIMPIEZA', 'UBICACIONES', 'ANORMAL']) await page.locator(`[data-foco="${f}"]`).getByTestId('foco-sin-problemas').click()
    await expect(page.getByTestId('progreso-revision')).toContainText('4 de 4')
    await expect(page.getByTestId('cerrar-revision')).toBeEnabled()
    await sinDesborde(page)
    await capturar(page, info, 'revision-diaria-lista', { completa: true })
    await page.getByTestId('cerrar-revision').click()
    await expect(page.getByTestId('revision-cerrada')).toBeVisible()
    await expect(page.getByTestId('estado-revision')).toHaveText(/Cerrada/)
    // el pendiente que puede afectar producto avisó a Dirección Técnica
    await cambiarRol(page, 'direccion_tecnica')
    await page.goto('/wms/alertas')
    await expect(page.getByText(/Cajas vacías frente al rack C-2/).first()).toBeVisible()
  })

  test('el responsable resuelve su pendiente; el Jefe lo verifica o lo reabre', async ({ page }, info) => {
    await entrarComo(page, 'auxiliar')
    await page.goto('/wms/revision-diaria')
    await expect(page.getByTestId('mis-pendientes')).toBeVisible()
    await expect(page.getByTestId('iniciar-revision')).toHaveCount(0) // el auxiliar no hace la revisión
    const suyo = page.getByTestId('pendiente').filter({ hasText: 'Cajas vacías apiladas frente al rack D-4' })
    await expect(suyo).toBeVisible()
    await suyo.getByTestId('pendiente-resolver').click()
    await suyo.getByTestId('pendiente-nota').fill('Retiradas al área de reciclaje')
    await suyo.getByTestId('pendiente-confirmar-resolver').click()
    await expect(suyo.getByTestId('estado-pendiente')).toHaveText(/por verificar/)
    await expect(suyo.getByTestId('pendiente-verificar')).toHaveCount(0) // verifica el Jefe, no el auxiliar
    await cambiarRol(page, 'jefe_almacen')
    const s2 = page.getByTestId('pendiente').filter({ hasText: 'Cajas vacías apiladas frente al rack D-4' })
    await s2.getByTestId('pendiente-reabrir').click()
    await expect(s2.getByTestId('pendiente-confirmar-reabrir')).toBeDisabled() // hay que decir qué falta
    await s2.getByTestId('pendiente-nota-reabrir').fill('Quedaron dos cajas')
    await s2.getByTestId('pendiente-confirmar-reabrir').click()
    await expect(s2.getByTestId('estado-pendiente')).toHaveText(/Abierto/)
    await sinDesborde(page)
    await capturar(page, info, 'revision-diaria-pendientes', { completa: true })
    // el otro (resuelto por el reemplazo) se verifica conforme y deja de arrastrarse
    const gotera = page.getByTestId('pendiente').filter({ hasText: 'Gotera leve' })
    await gotera.getByTestId('pendiente-verificar').click()
    await expect(page.getByTestId('pendiente').filter({ hasText: 'Gotera leve' })).toHaveCount(0)
  })
})

test.describe('programación de los 3 conteos semanales (INV-05)', () => {
  test('el Jefe programa por rotación, genera el conteo y cancela otro; ubicaciones con movimientos por verificar no se ofrecen', async ({ page }, info) => {
    await entrarComo(page, 'jefe_almacen')
    await page.goto('/wms/conteos')
    await expect(page.getByTestId('conteos-semana')).toBeVisible()
    await expect(page.getByTestId('slot-conteo')).toHaveCount(3)
    await expect(page.getByTestId('faltan-conteos')).toContainText('1, 2, 3')
    await capturar(page, info, 'conteos-semana', { completa: true })
    await page.locator('[data-orden="1"]').getByTestId('programar-slot').click()
    await expect(page.getByTestId('armar-conteo')).toBeVisible()
    await expect(page.locator('[data-testid^="prog-pos-"]').first()).toBeVisible()
    await expect(page.getByTestId('armar-conteo')).toContainText('Nunca contada')
    await capturar(page, info, 'conteos-programar', { completa: true })
    await page.getByTestId('programar-confirmar').click()
    await expect(page.locator('[data-orden="1"]')).toHaveAttribute('data-estado', 'PROGRAMADO')
    // el conteo 2 por rotación no repite las ubicaciones del 1
    await page.locator('[data-orden="2"]').getByTestId('programar-slot').click()
    await page.getByTestId('programar-confirmar').click()
    await expect(page.locator('[data-orden="2"]')).toHaveAttribute('data-estado', 'PROGRAMADO')
    const cod1 = (await page.locator('[data-orden="1"]').locator('p.tabular').first().textContent())!.split(' · ')
    const cod2 = (await page.locator('[data-orden="2"]').locator('p.tabular').first().textContent())!.split(' · ')
    expect(cod1.filter((c) => cod2.includes(c))).toEqual([])
    // se cancela con motivo; se genera el otro
    await page.locator('[data-orden="2"]').getByTestId('cancelar-programacion').click()
    await expect(page.getByTestId('cancelar-confirmar')).toBeDisabled()
    await page.getByTestId('cancelar-motivo').fill('Cambia el plan de la semana')
    await page.getByTestId('cancelar-confirmar').click()
    await expect(page.locator('[data-orden="2"]')).toHaveAttribute('data-estado', 'LIBRE')
    await page.locator('[data-orden="1"]').getByTestId('generar-conteo').click()
    await expect(page.locator('[data-orden="1"]')).toHaveAttribute('data-estado', 'GENERADO')
    await sinDesborde(page)
    await capturar(page, info, 'conteos-semana-generado', { completa: true })
    await page.locator('[data-orden="1"]').getByTestId('ir-conteo-generado').click()
    await expect(page.getByTestId('titulo-conteo')).toHaveText(/CT-\d{4}-\d{5}/)
    await expect(page.getByTestId('conteo-ubicaciones-pausadas')).toBeVisible()
    // el auxiliar ve la programación pero no la puede cambiar
    await cambiarRol(page, 'auxiliar')
    await page.goto('/wms/conteos')
    await expect(page.getByTestId('programar-slot')).toHaveCount(0)
    await expect(page.getByTestId('conteos-semana')).toBeVisible()
  })

  test('una ubicación en conteo no aparece como origen ni como destino al mover', async ({ page }, info) => {
    await entrarComo(page, 'jefe_almacen')
    await page.goto('/wms/movimientos/nuevo')
    const abrirOrigenes = async () => {
      if (esTelefono(info)) { await page.getByTestId('editar-linea').first().click(); await expect(page.getByTestId('hoja-linea')).toBeVisible() }
      const campo = esTelefono(info) ? page.getByTestId('hoja-linea').getByTestId('buscar-producto') : page.getByTestId('buscar-producto').last()
      await campo.fill('dapagliflozina')
      await page.getByTestId('opcion-producto').first().click()
      await expect(page.getByTestId('lista-origenes')).toBeVisible()
    }
    await abrirOrigenes()
    const codigos = await page.getByTestId('opcion-origen').locator('strong').allTextContents()
    expect(codigos.length).toBeGreaterThan(1)
    // el Jefe pone una de esas ubicaciones en conteo (conteo extra por incidencia); se salta las que tienen movimientos por verificar
    await page.goto('/wms/conteos')
    let enConteo = ''
    for (const c of codigos.filter((x) => /^\w-[\d.]+$/.test(x))) {
      await page.getByTestId('conteo-buscar').fill(c)
      const caja = page.getByTestId(`conteo-pos-${c}`)
      if (await caja.isEnabled().catch(() => false)) { await caja.check(); enConteo = c; break }
    }
    expect(enConteo).not.toBe('')
    await page.getByTestId('conteo-incidencia').fill('Sospecha de faltante en la ubicación')
    await page.getByTestId('conteo-programar').click()
    await expect(page.getByTestId('titulo-conteo')).toHaveText(/CT-\d{4}-\d{5}/)
    // al mover, ya no aparece como origen…
    await page.goto('/wms/movimientos/nuevo')
    await abrirOrigenes()
    const ahora = await page.getByTestId('opcion-origen').locator('strong').allTextContents()
    expect(ahora).not.toContain(enConteo)
    expect(ahora.length).toBe(codigos.filter((c) => c !== enConteo).length)
    await capturar(page, info, 'mover-ubicacion-en-conteo')
    // …ni como destino
    await page.locator('[data-testid="opcion-origen"]:not([disabled])').first().click()
    await expect(page.getByTestId('lista-destinos')).toBeVisible()
    await page.getByTestId('destino-buscar').fill(enConteo)
    await expect(page.getByText('Ninguna ubicación coincide.')).toBeVisible()
  })
})

test.describe('reportes', () => {
  test('cada rol ve los reportes que le corresponden; filtra sin tildes, guarda vistas y descarga CSV y Excel', async ({ page }, info) => {
    await entrarComo(page, 'auxiliar')
    await page.goto('/wms/reportes')
    await expect(page.getByTestId('reporte-enlace')).toHaveCount(5) // sin exactitud ni auditoría
    await cambiarRol(page, 'jefe_almacen')
    await page.goto('/wms/reportes')
    await expect(page.getByTestId('reporte-enlace')).toHaveCount(6) // el Jefe no audita
    await capturar(page, info, 'reportes', { completa: true })
    await cambiarRol(page, 'auditoria_lectura')
    await page.goto('/wms/reportes')
    await expect(page.getByTestId('reporte-enlace')).toHaveCount(7)
    await cambiarRol(page, 'jefe_almacen')

    // inventario: tabla en PC/tablet, tarjetas en el teléfono; filtros y vistas
    await page.goto('/wms/reportes/inventario')
    await expect(page.getByTestId('titulo-reporte')).toHaveText('Inventario')
    await expect(esTelefono(info) ? page.getByTestId('reporte-tarjeta').first() : page.getByTestId('reporte-fila').first()).toBeVisible()
    await expect(page.getByTestId('reporte-resumen')).toContainText('Unidades')
    await sinDesborde(page)
    await capturar(page, info, 'reporte-inventario')
    const total = await page.getByTestId('reporte-resumen').textContent()
    await page.getByTestId('filtro-q').fill('DAPAGLIFLOZINA') // mayúsculas y sin tildes
    await expect(page.getByTestId('reporte-resumen')).not.toHaveText(total!)
    const filtrado = await page.getByTestId('reporte-resumen').textContent()
    await page.getByTestId('reporte-guardar-vista').click()
    await page.getByTestId('reporte-vista-nombre').fill('Solo dapagliflozina')
    await page.getByTestId('reporte-vista-confirmar').click()
    await expect(page.getByTestId('reporte-vista')).toHaveText('Solo dapagliflozina')
    await page.getByTestId('reporte-limpiar').click()
    await expect(page.getByTestId('reporte-resumen')).toHaveText(total!)
    await page.getByTestId('reporte-vista').click()
    await expect(page.getByTestId('reporte-resumen')).toHaveText(filtrado!)
    await capturar(page, info, 'reporte-inventario-filtrado')
    // descargas con los mismos filtros
    const csv = await page.request.get((await page.getByTestId('exportar-csv').getAttribute('href'))!.replace(/^\//, '/wms/'))
    expect(csv.status()).toBe(200)
    expect(csv.headers()['content-type']).toContain('text/csv')
    const cuerpo = await csv.text()
    expect(cuerpo.charCodeAt(0)).toBe(0xfeff)
    expect(cuerpo.split('\r\n')[0]).toContain('Producto,Lote,Vence')
    expect(cuerpo.toLowerCase()).toContain('dapagliflozina')
    const xlsx = await page.request.get((await page.getByTestId('exportar-xlsx').getAttribute('href'))!.replace(/^\//, '/wms/'))
    expect(xlsx.status()).toBe(200)
    expect(xlsx.headers()['content-type']).toContain('spreadsheetml')
    expect((await xlsx.body()).subarray(0, 2).toString()).toBe('PK')
    // sin permiso, ni pantalla ni descarga
    await cambiarRol(page, 'auxiliar')
    expect((await page.request.get('/wms/reportes/exactitud/exportar?formato=csv')).status()).toBe(403)
    await page.goto('/wms/reportes/exactitud')
    await expect(page).toHaveURL(/\/wms\/reportes\/?$/)
  })

  test('ocupación, recepciones, calidad, movimientos, exactitud y auditoría abren con sus filtros y sin desborde', async ({ page }, info) => {
    await entrarComo(page, 'auditoria_lectura')
    for (const id of ['ocupacion', 'recepciones', 'calidad', 'movimientos', 'exactitud', 'auditoria']) {
      await page.goto(`/wms/reportes/${id}`)
      await expect(page.getByTestId('titulo-reporte')).toBeVisible()
      await expect(page.getByTestId('reporte-filtros')).toBeVisible()
      await expect(page.getByTestId('exportar-csv')).toBeVisible()
      await expect(page.locator('[data-testid="reporte-fila"], [data-testid="reporte-tarjeta"], [data-testid="reporte-vacio"]').first()).toBeAttached()
      await sinDesborde(page)
      await capturar(page, info, `reporte-${id}`)
    }
  })
})
