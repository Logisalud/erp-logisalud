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
    await expect(page.getByTestId('reporte-enlace')).toHaveCount(6) // sin exactitud ni auditoría
    await cambiarRol(page, 'jefe_almacen')
    await page.goto('/wms/reportes')
    await expect(page.getByTestId('reporte-enlace')).toHaveCount(7) // el Jefe no audita
    await capturar(page, info, 'reportes', { completa: true })
    await cambiarRol(page, 'auditoria_lectura')
    await page.goto('/wms/reportes')
    await expect(page.getByTestId('reporte-enlace')).toHaveCount(8)
    await cambiarRol(page, 'jefe_almacen')

    // inventario: tabla en PC/tablet, tarjetas en el teléfono; filtros y vistas
    await page.goto('/wms/reportes/inventario')
    await expect(page.getByTestId('titulo-reporte')).toHaveText('Inventario')
    await expect(esTelefono(info) ? page.getByTestId('reporte-tarjeta').first() : page.getByTestId('reporte-fila').first()).toBeVisible()
    await expect(page.getByTestId('reporte-resumen')).toContainText('Unidades')
    await sinDesborde(page)
    await capturar(page, info, 'reporte-inventario')
    const total = await page.getByTestId('reporte-resumen').textContent()
    if (esTelefono(info)) await page.getByTestId('reporte-filtros-abrir').click() // en el teléfono los filtros se abren a pedido
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
    for (const id of ['vencimientos', 'ocupacion', 'recepciones', 'calidad', 'movimientos', 'exactitud', 'auditoria']) {
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

test.describe('reporte de Vencimientos', () => {
  /** Los «días para vencer» de las filas que se ven, sea tabla (PC y tablet) o filas compactas (teléfono). */
  async function diasVisibles(page: Page, info: Parameters<typeof esTelefono>[0]): Promise<number[]> {
    if (esTelefono(info)) {
      const textos = await page.getByTestId('reporte-tarjeta').allInnerTexts()
      return textos.map((t) => { const m = /Vencido hace (\d+)|Vence en (\d+)|Vence hoy/.exec(t); return !m ? NaN : m[1] ? -Number(m[1]) : m[2] ? Number(m[2]) : 0 })
    }
    const cab = await page.locator('thead th').allInnerTexts()
    const i = cab.findIndex((c) => /Días para vencer/.test(c))
    const celdas = await page.locator(`[data-testid="reporte-fila"] td:nth-child(${i + 1})`).allInnerTexts()
    return celdas.map((c) => Number(c.replace(/\s/g, '').replace('−', '-')))
  }

  test('es el primero de Reportes, con acceso directo desde Inicio y desde la alerta de vencimiento', async ({ page }) => {
    await entrarComo(page, 'jefe_almacen')
    await page.goto('/wms/reportes')
    await expect(page.getByTestId('reporte-enlace').first()).toHaveAttribute('data-reporte', 'VENCIMIENTOS')
    await page.goto('/wms')
    await expect(page.getByTestId('atajo-vencimientos')).toBeVisible()
    await page.getByTestId('atajo-vencimientos').click()
    await expect(page.getByTestId('titulo-reporte')).toHaveText('Vencimientos')
    await page.goto('/wms/alertas')
    const enlace = page.getByTestId('alerta-ver-vencimientos').first()
    if (await enlace.count()) { await enlace.click(); await expect(page.getByTestId('titulo-reporte')).toHaveText('Vencimientos') }
  })

  test('abre con los vencidos primero y luego del más próximo al más lejano; los tramos filtran y traen sus totales', async ({ page }, info) => {
    await entrarComo(page, 'jefe_almacen')
    await page.goto('/wms/reportes/vencimientos')
    await expect(page.getByTestId('tramos')).toBeVisible()
    const chips = page.getByTestId('tramo-chip')
    await expect(chips.first()).toContainText('Vencido')
    await expect(page.getByTestId('tramo-chip').filter({ hasText: '0–3 meses' })).toBeVisible()
    await expect(page.getByTestId('tramo-chip').filter({ hasText: '3–6 meses' })).toBeVisible()
    await expect(page.getByTestId('tramo-chip').filter({ hasText: '6–12 meses' })).toBeVisible()
    await expect(page.getByTestId('tramo-chip').filter({ hasText: 'Más de 12 meses' })).toBeVisible()
    await expect(chips.first()).toContainText(/\d+ lotes? · [\d.,]+ u/)
    // orden por defecto
    const dias = await diasVisibles(page, info)
    expect(dias.length).toBeGreaterThan(5)
    expect(dias[0]).toBeLessThan(0) // un vencido abre la lista
    expect(dias).toEqual([...dias].sort((a, b) => a - b))
    await sinDesborde(page)
    await capturar(page, info, 'reporte-vencimientos')
    // el tramo «Vencido» deja solo lo vencido y su total coincide con el del chip
    const vencido = page.locator('[data-testid="tramo-chip"][data-tramo="Vencido"]')
    const unidades = /([\d.,]+) u/.exec((await vencido.innerText()))![1]
    await vencido.click()
    await expect(vencido).toHaveAttribute('aria-pressed', 'true')
    const filas = await diasVisibles(page, info)
    expect(filas.length).toBeGreaterThan(0)
    expect(filas.every((d) => d < 0)).toBe(true)
    await expect(page.getByTestId('reporte-resumen')).toContainText(`Unidades: ${unidades}`)
    await capturar(page, info, 'reporte-vencimientos-tramo')
    // otro tramo, y «Todos» lo suelta
    await page.locator('[data-testid="tramo-chip"][data-tramo="0–3 meses"]').click()
    expect((await diasVisibles(page, info)).every((d) => d >= 0 && d <= 90)).toBe(true)
    await page.getByTestId('tramo-todos').click()
    expect((await diasVisibles(page, info)).length).toBeGreaterThan(filas.length)
  })

  test('filtra por propietario, estado, producto y ubicación; ordena por cualquier columna y guarda la vista', async ({ page }, info) => {
    test.skip(esTelefono(info), 'En el teléfono las filas no tienen encabezados para ordenar; el orden y los filtros se cubren en los demás viewports')
    await entrarComo(page, 'jefe_almacen')
    await page.goto('/wms/reportes/vencimientos')
    const total = await page.getByTestId('reporte-resumen').innerText()
    await page.getByTestId('filtro-producto').fill('DAPAGLIFLOZINA')
    await expect(page.getByTestId('reporte-resumen')).not.toHaveText(total)
    await page.getByTestId('filtro-ubicacion').fill('zzz')
    await expect(page.getByTestId('reporte-vacio')).toBeVisible()
    await page.getByTestId('filtro-ubicacion').fill('')
    await page.getByTestId('filtro-propietario').selectOption({ index: 1 })
    await page.getByTestId('filtro-estado').selectOption({ index: 1 })
    await expect(page.locator('[data-testid="reporte-fila"], [data-testid="reporte-vacio"]').first()).toBeAttached() // pueden no coincidir juntos
    await page.getByTestId('filtro-propietario').selectOption('')
    await page.getByTestId('filtro-estado').selectOption('')
    // orden por la columna Unidades (dos clics: de menor a mayor y de mayor a menor)
    await page.getByTestId('ordenar-cantidad').click()
    await page.getByTestId('ordenar-cantidad').click()
    const cab = await page.locator('thead th').allInnerTexts()
    const i = cab.findIndex((c) => /Unidades/.test(c))
    const cant = (await page.locator(`[data-testid="reporte-fila"] td:nth-child(${i + 1})`).allInnerTexts()).map((c) => Number(c.replace(/\D/g, '')))
    expect(cant).toEqual([...cant].sort((a, b) => b - a))
    // vista guardada: filtros y orden vuelven juntos
    await page.getByTestId('reporte-guardar-vista').click()
    await page.getByTestId('reporte-vista-nombre').fill('Dapagliflozina por unidades')
    await page.getByTestId('reporte-vista-confirmar').click()
    await page.getByTestId('reporte-limpiar').click()
    const dias = await diasVisibles(page, info)
    expect(dias).toEqual([...dias].sort((a, b) => a - b)) // vuelve al orden por defecto
    await page.getByTestId('reporte-vista').click()
    await expect(page.getByTestId('filtro-producto')).toHaveValue('DAPAGLIFLOZINA')
    const cant2 = (await page.locator(`[data-testid="reporte-fila"] td:nth-child(${i + 1})`).allInnerTexts()).map((c) => Number(c.replace(/\D/g, '')))
    expect(cant2).toEqual([...cant2].sort((a, b) => b - a))
    await capturar(page, info, 'reporte-vencimientos-filtrado')
  })

  test('la descarga en Excel y CSV trae lo que se ve: el tramo elegido y el mismo orden', async ({ page }, info) => {
    await entrarComo(page, 'jefe_almacen')
    await page.goto('/wms/reportes/vencimientos')
    await page.locator('[data-testid="tramo-chip"][data-tramo="Vencido"]').click()
    const base = (h: string) => h.replace(/^\//, '/wms/')
    const csv = await page.request.get(base((await page.getByTestId('exportar-csv').getAttribute('href'))!))
    expect(csv.status()).toBe(200)
    const cuerpo = await csv.text()
    expect(cuerpo.charCodeAt(0)).toBe(0xfeff) // BOM: Excel abre las tildes bien
    const lineas = cuerpo.trim().split('\r\n')
    expect(lineas[0]).toBe('Producto,Código,Lote,Vence,Días para vencer,Tramo,Propietario,Ubicación,Estado sanitario,Unidades')
    expect(lineas.length).toBeGreaterThan(1)
    expect(lineas.slice(1).every((l) => l.includes(',Vencido,'))).toBe(true)
    const dias = lineas.slice(1).map((l) => Number(l.split(',')[4]))
    expect(dias).toEqual([...dias].sort((a, b) => a - b))
    expect(lineas.length - 1).toBe((await diasVisibles(page, info)).length) // lo mismo que en pantalla
    const xlsx = await page.request.get(base((await page.getByTestId('exportar-xlsx').getAttribute('href'))!))
    expect(xlsx.status()).toBe(200)
    expect(xlsx.headers()['content-type']).toContain('spreadsheetml')
    expect((await xlsx.body()).subarray(0, 2).toString()).toBe('PK')
    expect(xlsx.headers()['content-disposition']).toContain('Vencimientos')
  })

  test('en el teléfono cada lote es una fila compacta: producto, lote, vence en X días y ubicación, sin desplazamiento horizontal', async ({ page }, info) => {
    test.skip(!esTelefono(info), 'Solo el teléfono usa filas compactas')
    await entrarComo(page, 'jefe_almacen')
    await page.goto('/wms/reportes/vencimientos')
    const fila = page.getByTestId('reporte-tarjeta').first()
    await expect(fila).toContainText(/Lote .+ · /)
    await expect(fila).toContainText(/Vencido hace \d+|Vence en \d+/)
    await expect(page.getByTestId('reporte-tabla')).toBeHidden()
    await sinDesborde(page)
    // los tramos se desplazan de lado dentro de su franja, no la página
    await expect(page.getByTestId('tramos')).toBeVisible()
    await expect(page.getByTestId('exportar-xlsx')).toBeVisible()
    await capturar(page, info, 'reporte-vencimientos-movil', { completa: true })
    await fila.click() // lleva al Kardex del lote
    await expect(page).toHaveURL(/\/wms\/kardex/)
  })
})
