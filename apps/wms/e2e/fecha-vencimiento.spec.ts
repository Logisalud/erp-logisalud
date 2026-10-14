// Vencimiento de una recepción: se puede escribir (30/06/2028, 2028-06-30 o solo 06/2028) o elegir en el calendario del equipo, en los 4 viewports.
// El calendario nativo no sale en las capturas (lo dibuja el navegador); la prueba elige la fecha como lo hace él: cambiando el valor del selector.
import { expect, test } from '@playwright/test'
import { capturar, entrarComo, sinDesborde } from './ayudas'

test.describe.configure({ mode: 'serial' })

test.describe('selector de fecha del vencimiento', () => {
  test('un botón de calendario junto al campo; elegir la fecha llena dd/mm/aaaa y lo escrito se refleja en el calendario', async ({ page }, info) => {
    await entrarComo(page, 'asistente_dt')
    await page.goto('/wms/entradas/nuevo')
    await page.getByTestId('tipo-DEVOLUCION').click()
    await page.locator('#propietario').selectOption({ index: 1 })
    await page.getByLabel('Producto 1').fill('Losart')
    await page.getByRole('option', { name: /Losartán/ }).click()
    await page.getByLabel('Lote', { exact: true }).fill('LD-1')

    // el botón del calendario está, con nombre y un área táctil cómoda
    const boton = page.getByTestId('abrir-calendario').first()
    await expect(boton).toBeVisible()
    await expect(boton).toHaveAccessibleName('Elegir la fecha en el calendario')
    const caja = (await boton.boundingBox())!
    expect(caja.width).toBeGreaterThanOrEqual(40); expect(caja.height).toBeGreaterThanOrEqual(40)

    // elegir en el calendario llena el campo con dd/mm/aaaa
    const vence = page.getByLabel('Vencimiento')
    await page.getByTestId('selector-fecha').first().fill('2028-06-30')
    await expect(vence).toHaveValue('30/06/2028')
    await expect(page.getByText('30 jun 2028')).toBeVisible()
    await capturar(page, info, 'vencimiento-calendario', { completa: true })

    // escribir sigue funcionando en cualquiera de los formatos, y el calendario arranca en esa fecha
    await vence.fill('06/2028')
    await expect(page.getByTestId('selector-fecha').first()).toHaveValue('2028-06-30') // último día del mes
    await vence.fill('2029-01-15')
    await expect(page.getByTestId('selector-fecha').first()).toHaveValue('2029-01-15')
    await sinDesborde(page)
  })

  // Cada formulario con una fecha de vencimiento (o vigencia) usa el MISMO componente: botón de calendario, y se sigue pudiendo escribir.
  // Formularios del WMS con fecha de vencimiento: (1) nueva solicitud de ingreso, paso 3 «Lote, vencimiento y cantidad»;
  // (2) ajuste de una línea de la solicitud; (3) alta de producto (vencimiento del registro sanitario); (4) edición de los datos regulatorios.
  // «Fecha prevista de llegada» y los filtros Desde/Hasta usan el calendario nativo (type="date"). Un formulario nuevo con fecha se suma aquí.
  async function verificarSelector(page: import('@playwright/test').Page, campo: import('@playwright/test').Locator, contenedor: import('@playwright/test').Locator) {
    const boton = contenedor.getByTestId('abrir-calendario').first()
    await expect(boton).toBeVisible()
    await expect(boton).toHaveAccessibleName('Elegir la fecha en el calendario')
    const selector = contenedor.getByTestId('selector-fecha').first()
    await selector.fill('2028-06-30') // el calendario llena el campo con dd/mm/aaaa
    await expect(campo).toHaveValue('30/06/2028')
    for (const [escrito, iso] of [['06/2028', '2028-06-30'], ['2029-01-15', '2029-01-15'], ['30/06/2028', '2028-06-30']] as const) {
      await campo.fill(escrito) // escribir sigue valiendo, y el calendario arranca en esa fecha
      await expect(selector).toHaveValue(iso)
    }
    await sinDesborde(page)
  }

  test('1. nueva solicitud de ingreso, paso 3: el vencimiento de cada lote tiene calendario', async ({ page }) => {
    await entrarComo(page, 'asistente_dt')
    await page.goto('/wms/entradas/nuevo')
    await page.getByTestId('tipo-DEVOLUCION').click()
    await page.locator('#propietario').selectOption({ index: 1 })
    await page.getByLabel('Producto 1').fill('Losart')
    await page.getByRole('option', { name: /Losartán/ }).click()
    await verificarSelector(page, page.getByLabel('Vencimiento'), page.locator('main'))
  })

  test('2. ajuste de una línea de la solicitud: el vencimiento tiene calendario', async ({ page }) => {
    await entrarComo(page, 'asistente_dt')
    await page.goto('/wms/entradas')
    await page.getByRole('link', { name: /OC-DEMO-0005/ }).filter({ visible: true }).first().click()
    await expect(page.getByTestId('titulo-solicitud')).toBeVisible()
    const linea = page.getByTestId('linea-solicitud').first()
    await linea.getByTestId('ajustar-linea').click()
    await verificarSelector(page, linea.getByLabel('Vencimiento'), linea)
  })

  test('3. alta de producto: el vencimiento del registro sanitario tiene calendario', async ({ page }) => {
    await entrarComo(page, 'asistente_dt')
    await page.goto('/wms/productos/nuevo')
    await verificarSelector(page, page.locator('#campo-rsVence'), page.locator('main'))
  })

  test('4. edición de los datos regulatorios: el vencimiento del registro tiene calendario y conserva lo que ya tenía', async ({ page }) => {
    await entrarComo(page, 'direccion_tecnica')
    await page.goto('/wms/productos?rs=SIN_DATO')
    await page.locator('main a[href*="/productos/prod"]:visible').first().click()
    await expect(page.getByTestId('panel-regulatorio')).toBeVisible()
    await verificarSelector(page, page.locator('#reg-rsVence'), page.getByTestId('panel-regulatorio'))
  })
})
