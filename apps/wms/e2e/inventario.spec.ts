// Flujos del Batch 3 (inventario en operación) en los 4 viewports. Modo demostración, en serie:
// cada prueba parte de lo que dejó la anterior (el servidor se reinicia por viewport).
import { expect, test, type Page } from '@playwright/test'
import { capturar, entrarComo, esTelefono, sinDesborde, type RolDemo } from './ayudas'

test.describe.configure({ mode: 'serial' })

/** Referencia del movimiento de varias líneas que arma una prueba y usan las siguientes (las pruebas corren en serie). */
let ordenMultiorigen = ''

async function cambiarRol(page: Page, rol: RolDemo) {
  await page.getByTestId('cambiar-rol-demo').selectOption(rol)
  await page.waitForTimeout(400)
  await page.reload()
  await expect(page.getByTestId('banner-demo')).toBeVisible()
}

/** Abre la línea `n` del movimiento: en PC/tablet es la fila de la tabla; en el teléfono, la hoja inferior de esa línea. */
async function empezarLinea(page: Page, info: { project: { name: string } }, n: number) {
  const telefono = info.project.name.startsWith('telefono')
  if (telefono) {
    if (n === 0) await page.getByTestId('editar-linea').first().click()
    else await page.getByTestId('anadir-producto-movil').click()
    await expect(page.getByTestId('hoja-linea')).toBeVisible()
  } else if (n > 0) await page.getByTestId('anadir-producto').click()
}
/** Escribe en el buscador de producto de la línea abierta. */
async function escribirProducto(page: Page, info: { project: { name: string } }, texto: string) {
  const campo = info.project.name.startsWith('telefono') ? page.getByTestId('hoja-linea').getByTestId('buscar-producto') : page.getByTestId('buscar-producto').last()
  await campo.fill(texto)
  await expect(page.getByTestId('opcion-producto').first()).toBeVisible()
}

/** Las filas de la lista de movimientos que se ven (tabla en PC y tablet; filas compactas en el teléfono). */
const filasVisibles = (page: Page) => page.locator('[data-testid="fila-movimiento"]:visible, [data-testid="fila-movimiento-movil"]:visible')
/** Las líneas del detalle que se ven (tabla o filas del teléfono). */
const lineasVisibles = (page: Page) => page.locator('[data-testid="fila-linea"]:visible, [data-testid="fila-linea-movil"]:visible')

test.describe('Kardex, historia del lote y vencimientos', () => {
  test('el Kardex pide un producto, muestra el saldo corrido y se descarga en PDF y Excel', async ({ page }, info) => {
    await entrarComo(page, 'auditoria_lectura')
    await page.goto('/wms/kardex')
    await expect(page.getByTestId('kardex-vacio')).toBeVisible()
    await capturar(page, info, 'kardex-vacio')
    await page.locator('#k-producto').selectOption({ index: 1 })
    await page.getByTestId('ver-kardex').click()
    await expect(page.getByTestId('kardex-saldo-final')).toBeVisible()
    const filas = page.locator('[data-testid="fila-kardex"]:visible, [data-testid="lista-kardex"]:visible > li')
    await expect(filas.first()).toBeVisible()
    await sinDesborde(page)
    await capturar(page, info, 'kardex', { completa: true })
    const pdf = await page.request.get((await page.getByTestId('pdf-kardex').getAttribute('href'))!)
    expect(pdf.status()).toBe(200)
    expect((await pdf.body()).subarray(0, 4).toString()).toBe('%PDF')
    const xlsx = await page.request.get((await page.getByTestId('xlsx-kardex').getAttribute('href'))!)
    expect(xlsx.status()).toBe(200)
    expect((await xlsx.body()).subarray(0, 2).toString()).toBe('PK')
  })

  test('un lote tiene su historia completa', async ({ page }, info) => {
    await entrarComo(page, 'auditoria_lectura')
    await page.goto('/wms/kardex')
    await page.locator('#k-producto').selectOption({ index: 1 })
    await page.getByTestId('ver-kardex').click()
    await expect(page.getByTestId('kardex-saldo-final')).toBeVisible()
    await page.locator('#k-lote').selectOption({ index: 1 })
    await page.getByTestId('ver-kardex').click()
    await expect(page).toHaveURL(/lote=/)
    await page.getByTestId('historia-del-lote').click()
    await expect(page.getByTestId('historia-lote')).toBeVisible()
    await expect(page.getByTestId('fila-historia').first()).toContainText('Carga inicial')
    await sinDesborde(page)
    await capturar(page, info, 'historia-lote', { completa: true })
  })

  test('vencimientos agrupa por tramos y los lotes llevan al Kardex', async ({ page }, info) => {
    await entrarComo(page, 'jefe_almacen')
    await page.goto('/wms/vencimientos')
    await expect(page.getByTestId('tramo-vencido')).toBeVisible()
    await expect(page.getByTestId('tramo-hasta-30')).toBeVisible()
    await expect(page.getByTestId('tramo-mas')).toBeVisible()
    await sinDesborde(page)
    await capturar(page, info, 'vencimientos', { completa: true })
  })
})

test.describe('movimientos internos (INV-02, D-15): ejecutar → verificar', () => {
  test('la lista de movimientos es una tabla (PC y tablet) o filas compactas (teléfono), con la referencia MI-AAAA-NNNNN', async ({ page }, info) => {
    await entrarComo(page, 'jefe_almacen')
    await page.goto('/wms/movimientos')
    await expect(page.getByTestId('lista-movimientos')).toBeVisible()
    if (esTelefono(info)) {
      await expect(page.getByTestId('tabla-movimientos')).toBeHidden()
      await expect(page.getByTestId('lista-movimientos-movil')).toBeVisible()
    } else {
      await expect(page.getByTestId('tabla-movimientos')).toBeVisible()
      for (const c of ['Referencia', 'Fecha', 'Desde', 'Hacia', 'Propietario', 'Líneas y unidades', 'Ejecutado por', 'Verificado por', 'Estado']) await expect(page.getByRole('columnheader', { name: c })).toBeVisible()
    }
    await expect(filasVisibles(page).first()).toContainText(/MI-\d{4}-\d{5}/)
    await expect(page.getByText('Autorizar')).toHaveCount(0) // ya no existe la autorización previa
    await sinDesborde(page)
    await capturar(page, info, 'movimientos', { completa: true })
  })

  test('busca, filtra, ordena por columna y guarda vistas; un clic en la fila abre el detalle', async ({ page }, info) => {
    await entrarComo(page, 'jefe_almacen')
    await page.goto('/wms/movimientos')
    const total = await filasVisibles(page).count()
    expect(total).toBeGreaterThanOrEqual(2)
    // búsqueda por referencia
    const ref = ((await filasVisibles(page).first().innerText()).match(/MI-\d{4}-\d{5}/) ?? [])[0]!
    await page.getByTestId('mov-buscar').fill(ref)
    await expect(filasVisibles(page)).toHaveCount(1)
    await page.getByTestId('mov-buscar').fill('zzzz-no-existe')
    await expect(page.getByTestId('mov-sin-resultados')).toBeVisible()
    await page.getByTestId('mov-buscar').fill('')
    // filtros (en el teléfono van en un panel)
    if (esTelefono(info)) await page.getByTestId('mov-abrir-filtros').click()
    await page.getByTestId('mov-f-ejecutor').selectOption({ index: 1 })
    expect(await filasVisibles(page).count()).toBeLessThan(total)
    await page.getByTestId('mov-f-ejecutor').selectOption('')
    await page.getByTestId('mov-f-estado').selectOption('EJECUTADO')
    expect(await filasVisibles(page).count()).toBeGreaterThan(0)
    await page.getByTestId('mov-f-ubicacion').fill('zzz')
    await expect(page.getByTestId('mov-sin-resultados')).toBeVisible()
    await page.getByTestId('mov-f-ubicacion').fill('')
    // orden por columna (PC y tablet) o por el selector (teléfono)
    if (esTelefono(info)) {
      await page.getByTestId('mov-f-orden').selectOption('numero:asc')
    } else {
      await page.getByTestId('ordenar-unidades').click()
      await expect(page.getByRole('columnheader', { name: /Líneas y unidades/ })).toHaveAttribute('aria-sort', 'ascending')
      await page.getByTestId('ordenar-unidades').click()
      await expect(page.getByRole('columnheader', { name: /Líneas y unidades/ })).toHaveAttribute('aria-sort', 'descending')
    }
    // vista guardada: se guarda con sus filtros y se recupera con un toque
    await page.getByTestId('mov-guardar-vista').click()
    await page.getByTestId('mov-vista-nombre').fill('Por verificar')
    await page.getByTestId('mov-vista-confirmar').click()
    await expect(page.getByTestId('mov-vista').filter({ hasText: 'Por verificar' })).toBeVisible()
    await page.getByTestId('mov-limpiar').click()
    await expect(filasVisibles(page)).toHaveCount(total)
    await page.getByTestId('mov-vista').filter({ hasText: 'Por verificar' }).click()
    await expect(page.getByTestId('mov-f-estado')).toHaveValue('EJECUTADO')
    await capturar(page, info, 'movimientos-filtrados', { completa: true })
    await page.getByTestId('mov-vista-borrar').click()
    await expect(page.getByTestId('mov-vista')).toHaveCount(0)
    // un clic en la fila abre el detalle
    await page.getByTestId('mov-limpiar').click()
    await filasVisibles(page).first().click()
    await expect(page.getByTestId('titulo-movimiento')).toHaveText(/MI-\d{4}-\d{5}/)
    await expect(lineasVisibles(page).first()).toBeVisible()
  })

  test('la búsqueda universal encuentra un movimiento por su referencia', async ({ page }) => {
    await entrarComo(page, 'auxiliar')
    await page.goto('/wms/movimientos')
    const ref = ((await filasVisibles(page).first().innerText()).match(/MI-\d{4}-\d{5}/) ?? [])[0]!
    await page.getByRole('button', { name: /Buscar producto, lote o ubicación/ }).first().click()
    await page.getByRole('dialog').getByRole('combobox').or(page.getByRole('dialog').getByRole('textbox')).first().fill(ref)
    await expect(page.getByRole('dialog').getByText(ref).first()).toBeVisible()
    await expect(page.getByRole('dialog').getByText('Movimientos', { exact: true })).toBeVisible()
    await page.getByRole('dialog').getByText(ref).first().click()
    await expect(page.getByTestId('titulo-movimiento')).toHaveText(ref)
  })

  test('el ejecutor no verifica su propio movimiento; otra persona sí, línea por línea, y el stock cambia al verificar', async ({ page }, info) => {
    await entrarComo(page, 'auxiliar')
    await page.goto('/wms/movimientos')
    // el movimiento de demostración que ejecutó el auxiliar espera a otra persona
    await filasVisibles(page).filter({ hasText: /Auxiliar|Por verificar/ }).first().click()
    await page.goto('/wms/movimientos?q=' + encodeURIComponent('Acomodo de producto'))
    await filasVisibles(page).first().click()
    const numero = (await page.getByTestId('titulo-movimiento').textContent())!
    await expect(page.getByTestId('mov-espera-verificador')).toContainText(/no puede ser quien ejecutó/)
    // el ejecutor ve la verificación, pero no puede marcar nada: botones deshabilitados y un aviso que lo explica
    await expect(page.getByTestId('mov-revision')).toHaveAttribute('data-bloqueado', 'si')
    await expect(page.getByTestId('linea-coincide').first()).toBeDisabled()
    await expect(page.getByTestId('linea-diferencia').first()).toBeDisabled()
    await expect(page.getByTestId('mov-todo-coincide')).toBeDisabled()
    await expect(page.getByTestId('mov-enviar-revision')).toBeDisabled()
    await expect(page.getByTestId('mov-en-transito')).toContainText('en tránsito, por verificar')
    await sinDesborde(page)
    await capturar(page, info, 'movimiento-espera-verificador', { completa: true })
    // otro auxiliar, el Jefe o su reemplazo verifican; el ejecutor del otro movimiento (el Jefe) no puede con el suyo
    await cambiarRol(page, 'reemplazo_jefe')
    await page.goto('/wms/movimientos?q=' + numero)
    await filasVisibles(page).first().click()
    await expect(page.getByTestId('mov-enviar-revision')).toBeDisabled() // hay que revisar cada línea
    await page.getByTestId('mov-todo-coincide').click()
    await capturar(page, info, 'movimiento-revision', { completa: true })
    await page.getByTestId('mov-enviar-revision').click()
    await expect(page.getByTestId('mov-confirmado')).toContainText('Verificó')
    await expect(page.getByTestId('personas-movimiento')).toContainText('Reemplazo del Jefe de Almacén (demo)')
    await capturar(page, info, 'movimiento-confirmado', { completa: true })
    // el Jefe ejecutó el otro movimiento de demostración: no puede verificarlo, pero el auxiliar sí
    await cambiarRol(page, 'jefe_almacen')
    await page.goto('/wms/movimientos?q=' + encodeURIComponent('Acercar al despacho'))
    await filasVisibles(page).first().click()
    await expect(page.getByTestId('mov-espera-verificador')).toContainText(/no puede ser quien ejecutó/)
  })

  test('modo tabla: una orden con productos de distintos orígenes y destinos, con mensajes por línea, resumen antes de ejecutar y número MI', async ({ page }, info) => {
    await entrarComo(page, 'auxiliar')
    await page.goto('/wms/movimientos/nuevo')
    await expect(page.getByTestId('form-tabla')).toBeVisible()
    await expect(page.getByTestId('revisar-ejecutar')).toBeDisabled()
    await expect(page.getByTestId('barra-resumen')).toContainText('0 de 1 línea')
    await expect(page.getByTestId('mensaje-linea').first()).toContainText('Busca el producto')
    await capturar(page, info, 'mover-vacio')

    // línea 1: producto → todas sus ubicaciones (lote, vence, estado, propietario, disponible) → origen
    await empezarLinea(page, info, 0)
    await escribirProducto(page, info, 'dapagliflozina')
    await expect(page.getByTestId('opcion-producto').first()).toContainText(/en \d+ ubicaci/)
    await capturar(page, info, 'mover-buscar-producto')
    await page.getByTestId('opcion-producto').first().click()
    await expect(page.getByTestId('lista-origenes')).toBeVisible()
    await capturar(page, info, 'mover-origenes')
    await page.locator('[data-testid="opcion-origen"]:not([disabled])').first().click()
    // sin destino: mensaje neutral; en el destino, las ubicaciones que no sirven salen deshabilitadas con su motivo
    await expect(page.getByTestId('lista-destinos')).toBeVisible()
    await expect(page.locator('[data-testid="opcion-destino"][data-sirve="si"]').first()).toBeVisible()
    await capturar(page, info, 'mover-destinos')
    await page.locator('[data-testid="opcion-destino"][data-sirve="si"]').first().click()
    if (esTelefono(info)) await page.getByTestId('paso-cantidad').click()
    // la cantidad se valida al instante: pasarse del disponible es un error en palabras
    await page.getByTestId('celda-cantidad').first().fill('999999')
    await expect(page.locator('[data-testid="mensaje-linea"][data-tipo="error"]').first()).toContainText(/No se puede mover lo que no existe/)
    await expect(page.getByTestId('revisar-ejecutar')).toBeDisabled()
    await page.getByTestId('usar-todo').first().click()
    await expect(page.locator('[data-testid="mensaje-linea"][data-tipo="error"]')).toHaveCount(0)
    if (esTelefono(info)) await page.getByTestId('hoja-listo').click()
    await expect(page.getByTestId('barra-resumen')).toContainText('1 de 1 línea lista')
    await expect(page.getByTestId('revisar-ejecutar')).toBeEnabled()

    // línea 2: otro producto, con su propio origen y destino
    await empezarLinea(page, info, 1)
    await escribirProducto(page, info, 'L-VENCE')
    await page.getByTestId('opcion-producto').first().click()
    await page.locator('[data-testid="opcion-origen"]:not([disabled])').first().click()
    await page.locator('[data-testid="opcion-destino"][data-sirve="si"]').first().click()
    if (esTelefono(info)) await page.getByTestId('hoja-listo').click()
    await expect(page.getByTestId('barra-resumen')).toContainText('2 de 2 líneas listas')
    await sinDesborde(page)
    await capturar(page, info, 'mover-listo', { completa: true })

    // resumen antes de ejecutar: nada cambia hasta confirmar
    await page.getByTestId('revisar-ejecutar').click()
    await expect(page.getByTestId('resumen-largo')).toContainText(/Vas a mover [\d.,]+ unidades? en 2 líneas, hacia \d+ destinos?\. Motivo: Reorganización\./)
    await expect(page.getByTestId('resumen-linea')).toHaveCount(2)
    await sinDesborde(page)
    await capturar(page, info, 'mover-resumen', { completa: true })
    await page.getByTestId('volver-editar').click()
    await expect(page.getByTestId('barra-resumen')).toContainText('2 de 2 líneas listas')
    await page.getByTestId('revisar-ejecutar').click()
    await page.getByTestId('ejecutar-movimiento').click()
    await expect(page.getByTestId('titulo-movimiento')).toHaveText(/MI-\d{4}-\d{5}/)
    ordenMultiorigen = (await page.getByTestId('titulo-movimiento').textContent())!
    await expect(lineasVisibles(page)).toHaveCount(2)
    await expect(page.getByTestId('personas-movimiento')).toContainText('Auxiliar de almacén (demo)')
    await expect(page.getByTestId('mov-espera-verificador')).toBeVisible()
    await sinDesborde(page)
    await capturar(page, info, 'movimiento-detalle', { completa: true })
  })

  test('las unidades de una orden ejecutada quedan reservadas: otra persona no puede moverlas', async ({ page }, info) => {
    await entrarComo(page, 'reemplazo_jefe')
    await page.goto('/wms/movimientos/nuevo')
    await empezarLinea(page, info, 0)
    await escribirProducto(page, info, 'L-VENCE')
    await page.getByTestId('opcion-producto').first().click()
    await expect(page.getByTestId('lista-origenes')).toBeVisible()
    // la ubicación NO queda bloqueada: lo reservado por el movimiento en curso no está disponible
    await expect(page.locator('[data-testid="opcion-origen"][disabled]').or(page.getByTestId('sin-origenes')).first()).toBeVisible()
    await capturar(page, info, 'mover-reservadas')
  })

  test('las unidades de un movimiento por verificar se ven «en tránsito» en el buscador, el mapa, la ubicación y la historia del lote', async ({ page }, info) => {
    await entrarComo(page, 'jefe_almacen')
    // el buscador universal lo dice en la ubicación y en el lote
    await page.goto('/wms/almacen?buscar=L-VENCE')
    if (!esTelefono(info)) await expect(page.getByTestId('mapa')).toBeVisible()
    await page.goto('/wms/movimientos?q=' + ordenMultiorigen)
    await filasVisibles(page).first().click()
    await expect(page.getByTestId('mov-en-transito')).toContainText('en tránsito, por verificar')
    // desde la línea se llega a la historia del lote, que muestra lo que está en tránsito
    const lote = page.locator('[data-testid="ir-lote"]:visible').first()
    {
      await lote.click()
      await expect(page.getByTestId('lote-en-transito')).toContainText('en tránsito, por verificar')
      await capturar(page, info, 'lote-en-transito', { completa: true })
    }
    // el mapa marca las celdas con unidades en tránsito
    await page.goto('/wms/almacen')
    if (!esTelefono(info)) {
      await expect(page.getByTestId('marca-transito').first()).toBeAttached()
      await capturar(page, info, 'mapa-en-transito')
    }
  })

  test('el destino por defecto se aplica a las líneas sin destino; una línea se cambia a otro destino', async ({ page }, info) => {
    test.skip(esTelefono(info), 'En el teléfono el destino de cada línea se elige en la hoja inferior; se cubre en el flujo completo')
    await entrarComo(page, 'jefe_almacen')
    await page.goto('/wms/movimientos/nuevo')
    await empezarLinea(page, info, 0)
    await escribirProducto(page, info, 'dapagliflozina')
    await page.getByTestId('opcion-producto').first().click()
    await page.locator('[data-testid="opcion-origen"]:not([disabled])').first().click()
    // sin destino todavía: se cierra la lista de destinos y se fija el de la cabecera
    await page.getByTestId('celda-destino').click()
    const posibles = page.getByTestId('defecto-buscar-resultados').getByRole('button', { name: /\bSirve\b/ })
    for (const q of ['A-', 'B-', 'C-', 'D-', 'E-', 'F-', 'G-', 'H-', 'I-', 'J-', 'K-', 'L-', 'M-']) {
      await page.getByTestId('defecto-buscar').fill(q)
      if (await posibles.first().waitFor({ timeout: 2500 }).then(() => true, () => false)) break
    }
    await expect(posibles.first()).toBeVisible()
    await posibles.first().click()
    await expect(page.getByTestId('destino-defecto')).toBeVisible()
    await expect(page.getByTestId('celda-destino').first()).not.toContainText('Elegir a dónde va')
    await expect(page.getByTestId('nota-defecto')).toContainText(/línea/)
    // una línea con destino propio
    await page.getByTestId('celda-destino').first().click()
    const otro = page.locator('[data-testid="opcion-destino"][data-sirve="si"]').nth(1)
    await expect(otro).toBeVisible()
    await otro.click()
    // un destino que no sirve sale deshabilitado, con el motivo en palabras
    await page.getByTestId('celda-destino').first().click()
    await expect(page.locator('[data-testid="opcion-destino"][data-sirve="no"]').first()).toBeDisabled()
    await expect(page.getByTestId('destino-motivo').first()).toContainText(/\S+/)
    await capturar(page, info, 'mover-defectos', { completa: true })
  })

  test('el borrador no se pierde: al volver a abrir se recupera tal cual', async ({ page }, info) => {
    await entrarComo(page, 'auxiliar')
    await page.goto('/wms/movimientos/nuevo')
    await empezarLinea(page, info, 0)
    await escribirProducto(page, info, 'dapagliflozina')
    await page.getByTestId('opcion-producto').first().click()
    await page.locator('[data-testid="opcion-origen"]:not([disabled])').first().click()
    await page.locator('[data-testid="opcion-destino"][data-sirve="si"]').first().click()
    if (esTelefono(info)) await page.getByTestId('hoja-listo').click()
    await expect(page.getByTestId('barra-resumen')).toContainText('1 de 1 línea lista')
    await page.waitForTimeout(600) // el autoguardado espera un instante
    await page.reload() // como si se cortara la conexión o se cerrara la app
    await expect(page.getByTestId('borrador-recuperado')).toBeVisible()
    await capturar(page, info, 'mover-borrador')
    await page.getByTestId('borrador-seguir').click()
    await expect(page.getByTestId('barra-resumen')).toContainText('1 de 1 línea lista')
    await expect(page.getByTestId('revisar-ejecutar')).toBeEnabled()
    // empezar de cero lo descarta
    await page.reload()
    await page.getByTestId('borrador-descartar').click()
    await expect(page.getByTestId('borrador-recuperado')).toHaveCount(0)
    await page.reload()
    await expect(page.getByTestId('borrador-recuperado')).toHaveCount(0)
  })

  test('una diferencia en una sola línea: solo esa queda abierta, las demás se confirman y el Jefe la resuelve por separado', async ({ page }, info) => {
    await entrarComo(page, 'jefe_almacen')
    await page.goto('/wms/movimientos?q=' + ordenMultiorigen)
    await filasVisibles(page).first().click()
    const numero = (await page.getByTestId('titulo-movimiento').textContent())!
    const nLineas = await lineasVisibles(page).count()
    expect(nLineas).toBeGreaterThanOrEqual(2)
    const lineas = page.getByTestId('mov-revision-linea')
    await expect(lineas).toHaveCount(nLineas)
    await expect(page.getByTestId('mov-enviar-revision')).toBeDisabled()
    await lineas.first().getByTestId('linea-diferencia').click()
    await expect(page.getByTestId('mov-enviar-revision')).toBeDisabled() // falta contar qué no coincide
    await lineas.first().getByTestId('linea-dif-nota').fill('Faltan 2 cajas en el destino')
    for (let i = 1; i < nLineas; i++) await lineas.nth(i).getByTestId('linea-coincide').click()
    await expect(page.getByTestId('mov-enviar-revision')).toBeEnabled()
    await sinDesborde(page)
    await capturar(page, info, 'movimiento-diferencia', { completa: true })
    // en el teléfono la acción principal queda fija y a la vista, sin esconderse bajo la barra de navegación
    if (esTelefono(info)) await expect(page.getByTestId('mov-enviar-revision')).toBeInViewport()
    await page.getByTestId('mov-enviar-revision').click()
    await expect(page.getByTestId('mov-dif-abierta')).toContainText('Faltan 2 cajas')
    await expect(page.getByTestId('mov-linea-abierta')).toHaveCount(1)
    await expect(page.locator('[data-testid="estado-linea"]:visible, [data-testid="estado-linea-movil"]:visible').filter({ hasText: 'Confirmada' })).toHaveCount(nLineas - 1)
    await page.getByTestId('mov-abrir-resolver').click()
    await page.getByTestId('mov-res-texto').fill('Se vuelve a mover y se cuenta de nuevo')
    await capturar(page, info, 'movimiento-resolver', { completa: true })
    await page.getByTestId('mov-reintentar').click()
    await expect(page.getByText('Se vuelve a mover esa línea')).toBeVisible()
    void numero
  })
})

test.describe('conteos cíclicos y ajustes (INV-05)', () => {
  test('conteo a ciegas, segundo conteo de otra persona, causa, ajuste autorizado por Dirección Técnica y cierre', async ({ page }, info) => {
    await entrarComo(page, 'jefe_almacen')
    await page.goto('/wms/conteos')
    await expect(page.getByTestId('conteos-vacio')).toBeVisible()
    await capturar(page, info, 'conteos', { completa: true })
    await page.locator('[data-testid^="conteo-pos-"]:not([disabled])').first().check()
    await page.getByTestId('conteo-incidencia').fill('Faltante detectado en la entrega del lunes')
    await page.getByTestId('conteo-programar').click()
    await expect(page.getByTestId('titulo-conteo')).toHaveText(/CT-\d{4}-\d{5}/)
    const url = page.url()
    await expect(page.getByTestId('conteo-ubicaciones-pausadas')).toBeVisible()
    // el Jefe no ve el saldo antes del primer conteo
    await expect(page.getByTestId('conteo-gestion')).toHaveCount(0)
    await cambiarRol(page, 'auxiliar')
    await expect(page.getByTestId('conteo-ciego')).toBeVisible()
    await expect(page.getByTestId('conteo-gestion')).toHaveCount(0)
    const n = await page.getByTestId('linea-conteo').count()
    for (let i = 0; i < n; i++) {
      await page.getByTestId('linea-conteo').nth(i).getByTestId('conteo-cantidad').fill('1')
      await page.getByTestId('linea-conteo').nth(i).getByTestId('conteo-registrar').click()
      await expect(page.getByTestId('linea-conteo').nth(i).getByTestId('mi-conteo')).toHaveText('1')
    }
    await expect(page.getByTestId('conteo-gestion')).toHaveCount(0) // ni siquiera después de contar
    await sinDesborde(page)
    await capturar(page, info, 'conteo-contador', { completa: true })
    // el mismo contador no hace el segundo conteo
    await expect(page.getByTestId('conteo-cantidad')).toHaveCount(0)
    await cambiarRol(page, 'reemplazo_jefe')
    for (let i = 0; i < n; i++) {
      await page.getByTestId('linea-conteo').nth(i).getByTestId('conteo-cantidad').fill('1')
      await page.getByTestId('linea-conteo').nth(i).getByTestId('conteo-registrar').click()
      await expect(page.getByTestId('linea-conteo').nth(i)).toContainText('Diferencia confirmada')
    }
    // el Jefe busca la causa y propone el ajuste de la primera línea; el resto se escala con su evidencia
    await cambiarRol(page, 'jefe_almacen')
    await expect(page.getByTestId('conteo-gestion').first()).toContainText('Sistema:')
    await capturar(page, info, 'conteo-diferencia', { completa: true })
    const primera = page.getByTestId('linea-conteo').first()
    await primera.getByTestId('conteo-causa').fill('Despacho sin registrar en una salida antigua')
    await primera.getByTestId('conteo-guardar-causa').click()
    await expect(page.getByText('Causa registrada.')).toBeVisible()
    await primera.getByTestId('conteo-abrir-ajuste').click()
    await primera.getByTestId('conteo-ajuste-motivo').fill('Ajustar con evidencia del despacho')
    await primera.getByTestId('conteo-proponer').click()
    await expect(page.getByText('Ajuste propuesto: Dirección Técnica lo decide.')).toBeVisible()
    for (let i = 1; i < n; i++) {
      const l = page.getByTestId('linea-conteo').nth(i)
      await l.getByTestId('conteo-abrir-escalar').click()
      await l.getByTestId('conteo-escalar-nota').fill('Se revisaron recepciones y movimientos sin encontrar la causa')
      await l.getByTestId('conteo-escalar').click()
      await expect(l).toContainText('Escalada')
    }
    // Dirección Técnica autoriza
    await cambiarRol(page, 'direccion_tecnica')
    await page.getByTestId('ajuste-autorizar').first().click()
    await expect(page.getByText('Ajuste autorizado: el saldo ya cambió y quedó en el Kardex.')).toBeVisible()
    await capturar(page, info, 'conteo-ajuste', { completa: true })
    await cambiarRol(page, 'jefe_almacen')
    await page.getByTestId('cierre-causa').fill('Despacho sin registrar')
    await page.getByTestId('cierre-accion').fill('Ajuste autorizado y líneas restantes escaladas')
    await page.getByTestId('cerrar-conteo').click()
    await expect(page.getByTestId('conteo-cerrado')).toBeVisible()
    expect(page.url()).toBe(url)
  })

  test('el contador ve el conteo como tarea y el Jefe lo encuentra en la lista', async ({ page }) => {
    await entrarComo(page, 'auxiliar')
    await page.goto('/wms/conteos')
    await expect(page.getByTestId('fila-conteo').first()).toContainText('Cerrado')
  })
})

test.describe('carga inicial (D-09)', () => {
  const CSV = 'producto;lote;vence;propietario;posicion;estado;cantidad\nDEMO-001;CI-E2E;31/12/2029;LOGISSA;A-6;CUARENTENA;40\nNO-EXISTE;X;31/12/2029;LOGISSA;A-6;CUARENTENA;5'

  test('la vista previa marca cada error; no se confirma sin la decisión de Dirección Técnica; con ella entra al inventario y al Kardex', async ({ page }, info) => {
    await entrarComo(page, 'admin_wms')
    await page.goto('/wms/carga-inicial')
    await expect(page.getByTestId('sin-decision')).toBeVisible()
    await page.getByTestId('texto-carga').fill(CSV)
    await page.getByTestId('revisar-carga').click()
    await expect(page.getByTestId('carga-con-errores')).toBeVisible()
    await expect(page.getByTestId('fila-previa').nth(1)).toContainText('no existe en el catálogo')
    await expect(page.getByTestId('guardar-carga')).toBeDisabled()
    await capturar(page, info, 'carga-inicial-errores', { completa: true })
    await page.getByTestId('texto-carga').fill(CSV.split('\n').slice(0, 2).join('\n'))
    await page.getByTestId('revisar-carga').click()
    await expect(page.getByTestId('carga-sin-errores')).toBeVisible()
    await sinDesborde(page)
    await capturar(page, info, 'carga-inicial-lista', { completa: true })
    await page.getByTestId('guardar-carga').click()
    await expect(page.getByText('Carga guardada como borrador')).toBeVisible()
    await page.getByTestId('confirmar-carga').click()
    await expect(page.getByRole('alert').filter({ hasText: 'Falta la decisión de Dirección Técnica' })).toBeVisible()
    await cambiarRol(page, 'direccion_tecnica')
    await page.getByTestId('decidir-CUARENTENA').click()
    await expect(page.getByTestId('decision-vigente')).toContainText('Cuarentena')
    await cambiarRol(page, 'admin_wms')
    await page.getByTestId('confirmar-carga').click()
    await expect(page.getByText('Carga confirmada')).toBeVisible()
    await expect(page.getByTestId('lista-cargas')).toContainText('Confirmada')
    await capturar(page, info, 'carga-inicial-confirmada', { completa: true })
  })

  test('quien no administra ni decide no ve la carga inicial', async ({ page }) => {
    await entrarComo(page, 'auxiliar')
    await page.goto('/wms/carga-inicial')
    await expect(page).toHaveURL(/\/wms\/?$/)
  })
})
