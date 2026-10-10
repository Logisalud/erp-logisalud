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
})
