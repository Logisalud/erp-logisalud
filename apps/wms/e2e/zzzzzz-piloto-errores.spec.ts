// Piloto · errores de la demo (E-2, E-4, E-5) en los 4 viewports. Va al final (zzzzzz) porque «Iniciar recepción» cambia el estado de una solicitud de la demo.
// Las reglas de integridad (E-1, E-2) también tienen su prueba de dominio, de demo y de base de datos; aquí solo se comprueba lo que ve la persona.
import { expect, test, type Page } from '@playwright/test'
import { capturar, entrarComo, esTelefono, sinDesborde } from './ayudas'

test.describe.configure({ mode: 'serial' })

/** El enlace de una solicitud «por llegar»: en la tabla (PC y tablet) el chip está en otra celda de la misma fila; en el teléfono, dentro de la tarjeta. */
async function hrefPorLlegar(page: Page): Promise<string> {
  await page.goto('/wms/entradas')
  await expect(page.locator('a[href*="/entradas/"]:not([href$="/nuevo"])').filter({ visible: true }).first()).toBeVisible()
  const href = await page.evaluate(() => {
    const enlaces = [...document.querySelectorAll<HTMLAnchorElement>('a[href*="/entradas/"]:not([href$="/nuevo"])')]
    const a = enlaces.find((x) => (x.closest('tr') ?? x).textContent?.includes('Por llegar') && x.offsetParent !== null)
    return a?.getAttribute('href') ?? ''
  })
  expect(href, 'hay una solicitud por llegar').toBeTruthy()
  return href
}

test.describe('E-2 · «Salida de Cuarentena» en Mover', () => {
  test('con ese motivo, el origen ofrece solo lo que está en Cuarentena (o dice que no hay nada)', async ({ page }, info) => {
    await entrarComo(page, 'auxiliar')
    await page.goto('/wms/movimientos/nuevo')
    await expect(page.getByTestId('form-tabla')).toBeVisible()
    await page.getByTestId('motivo-rapido').filter({ hasText: 'Salida de Cuarentena' }).click()
    await expect(page.getByTestId('motivo-rapido').filter({ hasText: 'Salida de Cuarentena' })).toHaveAttribute('aria-pressed', 'true')
    if (esTelefono(info)) { await page.getByTestId('editar-linea').first().click(); await expect(page.getByTestId('hoja-linea')).toBeVisible() }
    const campo = esTelefono(info) ? page.getByTestId('hoja-linea').getByTestId('buscar-producto') : page.getByTestId('buscar-producto').last()
    await campo.fill('dapagliflozina')
    await expect(page.getByTestId('opcion-producto').first()).toBeVisible()
    await page.getByTestId('opcion-producto').first().click()
    // solo se ofrecen ubicaciones de Cuarentena (A-6 a A-9); si el producto no tiene nada ahí, la pantalla lo explica
    const origenes = page.getByTestId('opcion-origen')
    await expect(origenes.first().or(page.getByTestId('sin-origenes-motivo'))).toBeVisible()
    if (await origenes.count()) {
      for (const t of await origenes.locator('strong').allTextContents()) expect(t, 'origen fuera de Cuarentena').toMatch(/^A-[6-9]$/)
      // y el destino que sirve es solo de Aprobados
      await origenes.first().click()
      await expect(page.getByTestId('lista-destinos')).toBeVisible()
      const sirven = page.locator('[data-testid="opcion-destino"][data-sirve="si"]')
      await expect(page.locator('[data-testid="opcion-destino"]').first()).toBeVisible()
      // si el lote sigue en estado Cuarentena (p. ej. el de la carga inicial de otra prueba) ningún rack sirve y la pantalla lo explica; si ya está Aprobado, sirven solo las de Aprobados
      for (const t of await sirven.allTextContents()) expect(t, 'destino que no es Aprobados').toContain('Aprobados')
      await expect(page.locator('[data-testid="opcion-destino"][data-sirve="no"]').first()).toContainText(/Aprobados|Cuarentena|ubicación/)
    } else {
      await expect(page.getByTestId('sin-origenes-motivo')).toContainText('solo se mueve lo que está en Cuarentena')
    }
    await sinDesborde(page)
    await capturar(page, info, 'mover-salida-cuarentena')
  })
})

test.describe('E-4 · acta sin recepción iniciada', () => {
  test('el enlace a un acta que no existe lleva a la solicitud, que lo explica (no a un error)', async ({ page }) => {
    await entrarComo(page, 'jefe_almacen')
    const href = await hrefPorLlegar(page)
    const respuesta = await page.goto(`${href}/acta/no-existe/pdf`)
    expect(respuesta?.status()).toBe(200)
    await expect(page.getByTestId('titulo-solicitud')).toBeVisible()
    await expect(page.getByTestId('sin-acta-explicacion')).toBeVisible()
  })

  test('la solicitud «por llegar» explica qué falta y «Iniciar recepción» arranca la recepción real', async ({ page }, info) => {
    await entrarComo(page, 'jefe_almacen')
    await page.goto(await hrefPorLlegar(page))
    await expect(page.getByTestId('titulo-solicitud')).toBeVisible()
    await expect(page.getByTestId('sin-acta')).toBeVisible()
    await expect(page.getByTestId('sin-acta-explicacion')).toContainText('la recepción no se inició')
    await expect(page.getByText('Solicitud inexistente')).toHaveCount(0)
    await sinDesborde(page)
    await capturar(page, info, 'acta-sin-recepcion', { completa: true })
    await page.getByTestId('iniciar-recepcion-acta').click()
    // ahora sí hay recepción: aparece el panel real del acta (todavía sin poder generarla: faltan verificaciones)
    await expect(page.getByTestId('sin-acta')).toHaveCount(0)
    await expect(page.getByTestId('generar-acta')).toBeVisible()
    await expect(page.getByTestId('motivo-sin-acta')).toBeVisible()
  })
})

test.describe('E-5 · revisión diaria: quién lo resuelve', () => {
  test('el selector ofrece solo auxiliares', async ({ page }, info) => {
    await entrarComo(page, 'jefe_almacen')
    await page.goto('/wms/revision-diaria')
    if (await page.getByTestId('iniciar-revision').count()) await page.getByTestId('iniciar-revision').click()
    await expect(page.getByTestId('focos')).toBeVisible()
    const agregar = page.locator('[data-foco="ORDEN"]').getByTestId('foco-agregar-pendiente')
    // si otra prueba ya cerró la revisión de hoy no hay dónde agregar: la regla («solo auxiliares») queda cubierta por tests/components/revision-diaria-responsable.test.tsx y la base
    if (!(await agregar.count())) { await expect(page.getByText('Revisión cerrada')).toBeVisible(); return }
    await agregar.click()
    const opciones = await page.getByTestId('pendiente-responsable').locator('option').allTextContents()
    expect(opciones.length).toBeGreaterThan(1)
    for (const o of opciones.slice(1)) expect(o, 'solo auxiliares').toMatch(/Auxiliar/i)
    await expect(page.getByTestId('pendiente-solo-auxiliares')).toContainText('Lo resuelve un auxiliar')
    await sinDesborde(page)
    await capturar(page, info, 'revision-diaria-quien-resuelve', { completa: true })
  })
})
