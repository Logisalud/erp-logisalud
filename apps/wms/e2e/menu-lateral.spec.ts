// SA-4: menú lateral por rol, con Salidas agrupada y secciones en el orden del trabajo (D-131 a D-133).
// «Nueva salida» solo se comprueba como ENLACE (apunta a /salidas/nueva): la pantalla la crea otro paso del bloque.
import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { capturar, entrarComo, esTelefono, sinDesborde } from './ayudas'

const esAncho = (info: TestInfo) => info.project.name.startsWith('desktop') || info.project.name.startsWith('laptop')
const SECCIONES_JEFE = ['entradas', 'almacen', 'salidas', 'despacho', 'control']

/** El enlace de un destino en el menú del viewport: barra lateral (PC y tablet) o la hoja «Más» (teléfono). */
async function abrirMas(page: Page) {
  await page.getByRole('button', { name: /^Más/ }).click()
  const hoja = page.getByRole('dialog', { name: 'Más opciones' })
  await expect(hoja).toBeVisible()
  return hoja
}
const enlace = (page: Page, info: TestInfo, ruta: string, nombre: string) =>
  esTelefono(info) ? page.getByRole('dialog', { name: 'Más opciones' }).getByRole('link', { name: nombre }) : page.getByTestId(`nav-${ruta}`)

test.describe('menú lateral (SA-4)', () => {
  test('Jefe de Transporte: el grupo Salidas tiene los cuatro nombres y se navega por él', async ({ page }, info) => {
    await entrarComo(page, 'jefe_transporte')
    await sinDesborde(page)

    if (esTelefono(info)) {
      // La barra inferior muestra lo principal de su trabajo y «Más» agrupa por las mismas secciones.
      const barra = page.locator('nav[aria-label="Principal"]').last()
      await expect(barra.getByRole('link', { name: 'Inicio' })).toBeVisible()
      await expect(barra.getByTestId('inferior-salidas')).toBeVisible()
      await expect(barra.getByTestId('inferior-rutas')).toBeVisible()
      const hoja = await abrirMas(page)
      for (const id of SECCIONES_JEFE) await expect(hoja.locator(`[data-seccion="${id}"]`)).toBeVisible()
      await expect(hoja.getByRole('heading')).toContainText(['Entradas', 'Almacén', 'Salidas', 'Despacho y transporte', 'Control'])
      await capturar(page, info, 'menu-lateral-mas')
      await page.getByRole('dialog', { name: 'Más opciones' }).getByRole('button', { name: 'Cerrar', exact: true }).last().click()
    } else if (esAncho(info)) {
      await expect(page.locator('aside [data-testid^="seccion-"]')).toContainText(['Entradas', 'Almacén', 'Salidas', 'Despacho y transporte', 'Control'])
    } else {
      // Tablet: solo íconos, con una raya entre secciones.
      await expect(page.locator('aside [data-testid^="seccion-"]:visible')).toHaveCount(0)
      await expect(page.locator('aside [data-seccion]')).toHaveCount(6)
    }
    await capturar(page, info, 'menu-lateral')

    if (!esTelefono(info)) {
      const grupo = page.locator('aside [data-seccion="salidas"] a')
      await expect(grupo).toHaveCount(4)
      if (esAncho(info)) await expect(grupo).toContainText(['Pedidos por despachar', 'Órdenes de salida', 'Nueva salida', 'Rutas'])
      await expect(grupo.nth(2)).toHaveAttribute('href', '/wms/salidas/nueva')
    } else {
      const hoja = await abrirMas(page)
      await expect(hoja.locator('[data-seccion="salidas"] a')).toHaveText(['Pedidos por despachar', 'Órdenes de salida', 'Nueva salida', 'Rutas'])
      await expect(hoja.getByRole('link', { name: 'Nueva salida' })).toHaveAttribute('href', '/wms/salidas/nueva')
      await page.getByRole('dialog', { name: 'Más opciones' }).getByRole('button', { name: 'Cerrar', exact: true }).last().click()
    }

    for (const [ruta, nombre, url] of [['pedidos', 'Pedidos por despachar', /\/wms\/pedidos$/], ['salidas', 'Órdenes de salida', /\/wms\/salidas$/], ['rutas', 'Rutas', /\/wms\/rutas$/]] as const) {
      if (esTelefono(info)) await abrirMas(page)
      await enlace(page, info, ruta, nombre).click()
      await expect(page).toHaveURL(url)
      await sinDesborde(page)
    }
    // En la pantalla actual, su enlace queda marcado
    if (!esTelefono(info)) await expect(page.getByTestId('nav-rutas')).toHaveAttribute('aria-current', 'page')
  })

  test('cada rol ve solo lo que usa: el Auxiliar no ve la bandeja ni Nueva salida; Auditoría solo lee', async ({ page }, info) => {
    await entrarComo(page, 'jefe_transporte')
    // Cambio de rol con «Probar como»
    await page.getByTestId('cambiar-rol-demo').selectOption('auxiliar')
    await expect(page.getByTestId('cambiar-rol-demo')).toHaveValue('auxiliar')
    if (esTelefono(info)) await abrirMas(page)
    const menu = esTelefono(info) ? page.getByRole('dialog', { name: 'Más opciones' }) : page.locator('aside')
    await expect(menu.getByRole('link', { name: 'Preparar pedidos (picking)' })).toBeVisible()
    await expect(page.locator('a[href="/wms/pedidos"]')).toHaveCount(0)
    await expect(page.locator('a[href="/wms/salidas/nueva"]')).toHaveCount(0)
    await expect(page.locator('a[href="/wms/rutas"]')).toHaveCount(0)
    await expect(page.locator('a[href="/wms/picking"]').first()).toBeAttached()
    await expect(menu.locator('[data-seccion="salidas"] a')).toHaveCount(1)  // solo «Órdenes de salida» (lectura)
    await capturar(page, info, 'menu-lateral-auxiliar')
    if (esTelefono(info)) await page.getByRole('dialog', { name: 'Más opciones' }).getByRole('button', { name: 'Cerrar', exact: true }).last().click()

    await page.getByTestId('cambiar-rol-demo').selectOption('auditoria_lectura')
    await expect(page.getByTestId('cambiar-rol-demo')).toHaveValue('auditoria_lectura')
    await expect(page.locator('a[href="/wms/auditoria"]').first()).toBeAttached()
    await expect(page.locator('a[href="/wms/salidas"]').first()).toBeAttached()
    for (const h of ['/wms/salidas/nueva', '/wms/picking', '/wms/embalaje', '/wms/carga', '/wms/conformidad']) await expect(page.locator(`a[href="${h}"]`)).toHaveCount(0)

    await page.getByTestId('cambiar-rol-demo').selectOption('autoriza_salidas_sin_venta')
    await expect(page.getByTestId('cambiar-rol-demo')).toHaveValue('autoriza_salidas_sin_venta')
    await expect(page.locator('a[href="/wms/salidas/nueva"]').first()).toBeAttached()
    await expect(page.locator('a[href="/wms/pedidos"]')).toHaveCount(0)
    await expect(page.locator('[data-seccion="despacho"]')).toHaveCount(0)   // nadie ve un grupo vacío
  })

  test('barra ancha: Almacén y Control arrancan cerrados para el Jefe de Transporte, se abren con un toque y la sección actual no se oculta', async ({ page }, info) => {
    test.skip(!esAncho(info), 'Los encabezados colapsables son de la barra ancha')
    await entrarComo(page, 'jefe_transporte')
    await expect(page.getByTestId('seccion-almacen')).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByTestId('nav-movimientos')).toBeHidden()
    await expect(page.getByTestId('nav-rutas')).toBeVisible()                // lo suyo se ve sin desplazarse
    await expect(page.getByTestId('nav-salidas-nueva')).toBeInViewport()
    await page.getByTestId('seccion-almacen').click()
    await expect(page.getByTestId('nav-movimientos')).toBeVisible()
    await page.getByTestId('seccion-almacen').click()
    await expect(page.getByTestId('nav-movimientos')).toBeHidden()
    await page.goto('/wms/movimientos')                                        // estás en Movimientos: su sección sigue abierta
    await expect(page.getByTestId('nav-movimientos')).toBeVisible()
  })

  test('teléfono: «Más» abre primero lo de Salidas; Almacén y Control se abren con un toque', async ({ page }, info) => {
    test.skip(!esTelefono(info), 'Solo teléfono')
    await entrarComo(page, 'jefe_transporte')
    const hoja = await abrirMas(page)
    await expect(hoja.getByTestId('seccion-mas-almacen')).toHaveAttribute('aria-expanded', 'false')
    await expect(hoja.getByRole('link', { name: 'Nueva salida' })).toBeInViewport()
    await hoja.getByTestId('seccion-mas-almacen').click()
    await expect(hoja.getByRole('link', { name: 'Mapa del almacén' })).toBeVisible()
  })
})
