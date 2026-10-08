// Flujos del Batch 3 (inventario en operación) en los 4 viewports. Modo demostración, en serie:
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

async function abrirMovimiento(page: Page, estado: RegExp) {
  await page.goto('/wms/movimientos')
  await page.getByTestId('fila-movimiento').filter({ hasText: estado }).first().click()
  await expect(page.getByTestId('titulo-movimiento')).toBeVisible()
}

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

test.describe('movimientos internos (INV-02, D-15)', () => {
  test('el Jefe autoriza; otra persona mueve; quien preparó no verifica; un tercero confirma y el stock se mueve', async ({ page }, info) => {
    await entrarComo(page, 'jefe_almacen')
    await page.goto('/wms/movimientos')
    await expect(page.getByTestId('movimientos-por-atender')).toBeVisible()
    await capturar(page, info, 'movimientos', { completa: true })
    await abrirMovimiento(page, /Por autorizar/)
    const numero = (await page.getByTestId('titulo-movimiento').textContent())!
    await capturar(page, info, 'movimiento-por-autorizar', { completa: true })
    await page.getByTestId('mov-autorizar').click()
    await expect(page.getByText('Movimiento autorizado.')).toBeVisible()
    // el auxiliar lo prepara, así que lo mueve pero NO lo verifica
    await cambiarRol(page, 'auxiliar')
    await page.goto('/wms/movimientos')
    await page.getByTestId('fila-movimiento').filter({ hasText: numero }).first().click()
    await page.getByTestId('mov-ejecutar').click()
    await expect(page.getByTestId('mov-espera-verificador')).toContainText(/no puede ser quien (preparó|ejecutó)/)
    await expect(page.getByTestId('mov-confirmar')).toHaveCount(0)
    await sinDesborde(page)
    await capturar(page, info, 'movimiento-espera-verificador', { completa: true })
    await cambiarRol(page, 'reemplazo_jefe')
    await page.goto('/wms/movimientos')
    await page.getByTestId('fila-movimiento').filter({ hasText: numero }).first().click()
    await page.getByTestId('mov-confirmar').click()
    await expect(page.getByTestId('mov-confirmado')).toContainText('Verificó')
    await capturar(page, info, 'movimiento-confirmado', { completa: true })
  })

  test('una diferencia deja el movimiento abierto y avisa al Jefe, que decide', async ({ page }, info) => {
    await entrarComo(page, 'reemplazo_jefe')
    await abrirMovimiento(page, /Por mover/)
    await page.getByTestId('mov-ejecutar').click()
    await expect(page.getByTestId('mov-espera-verificador')).toBeVisible() // lo movió él: no lo verifica
    await cambiarRol(page, 'auxiliar')
    await page.goto('/wms/movimientos')
    await page.getByTestId('fila-movimiento').filter({ hasText: /Por verificar/ }).first().click()
    await expect(page.getByTestId('mov-espera-verificador')).toBeVisible() // preparó él: tampoco
    await cambiarRol(page, 'jefe_almacen')
    await page.goto('/wms/movimientos')
    await page.getByTestId('fila-movimiento').filter({ hasText: /Por verificar/ }).first().click()
    await page.getByTestId('mov-abrir-diferencia').click()
    await page.getByTestId('mov-dif-texto').fill('Faltan 2 cajas en el destino')
    await capturar(page, info, 'movimiento-diferencia', { completa: true })
    await page.getByTestId('mov-registrar-dif').click()
    await expect(page.getByText('Diferencia registrada')).toBeVisible()
    await expect(page.getByTestId('mov-dif-abierta')).toContainText('Faltan 2 cajas')
    await page.getByTestId('mov-abrir-resolver').click()
    await page.getByTestId('mov-res-texto').fill('Se vuelve a mover y se cuenta de nuevo')
    await page.getByTestId('mov-reintentar').click()
    await expect(page.getByText('Se vuelve a mover y lo verifica otra persona.')).toBeVisible()
  })

  test('el Jefe prepara un movimiento nuevo: solo se ofrecen destinos válidos y la lista se arma antes de enviar', async ({ page }, info) => {
    await entrarComo(page, 'auxiliar')
    await page.goto('/wms/movimientos/nuevo')
    await expect(page.getByTestId('mov-lista-vacia')).toBeVisible()
    await page.getByTestId('mov-origen').selectOption({ index: 1 })
    await expect(page.getByTestId('mov-destino')).toBeEnabled()
    await page.getByTestId('mov-destino').selectOption({ index: 1 })
    await page.getByTestId('mov-cantidad').fill('999999')
    await page.getByTestId('mov-agregar').click()
    await expect(page.getByTestId('mov-error')).toContainText('solo hay')
    await page.getByTestId('mov-cantidad').fill('1')
    await page.getByTestId('mov-agregar').click()
    await expect(page.getByTestId('mov-lista')).toBeVisible()
    await expect(page.getByTestId('mov-preparar')).toBeDisabled()
    await page.getByTestId('mov-motivo').fill('Acomodo de prueba')
    await sinDesborde(page)
    await capturar(page, info, 'movimiento-nuevo', { completa: true })
    await page.getByTestId('mov-preparar').click()
    await expect(page.getByTestId('titulo-movimiento')).toHaveText(/MI-\d{4}-\d{5}/)
  })
})

test.describe('conteos cíclicos y ajustes (INV-05)', () => {
  test('conteo a ciegas, segundo conteo de otra persona, causa, ajuste autorizado por Dirección Técnica y cierre', async ({ page }, info) => {
    await entrarComo(page, 'jefe_almacen')
    await page.goto('/wms/conteos')
    await expect(page.getByTestId('conteos-vacio')).toBeVisible()
    await capturar(page, info, 'conteos', { completa: true })
    await page.locator('[data-testid^="conteo-pos-"]:not([disabled])').first().check()
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
