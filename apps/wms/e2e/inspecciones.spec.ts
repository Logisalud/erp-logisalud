// Inspección de la unidad (LS-FR.49.03 y LS-FR.52.03): el conductor la llena con un click, otro la supervisa y el mes se descarga en Word. En los 4 viewports.
import { expect, test } from '@playwright/test'
import { entrarComo, esTelefono, sinDesborde } from './ayudas'

test.describe('inspección de la unidad', () => {
  test('el conductor registra la del día, otra persona la supervisa y el formato del mes baja en Word', async ({ page }, info) => {
    await entrarComo(page, 'conductor')
    if (!esTelefono(info)) await expect(page.getByRole('link', { name: /Inspección de la unidad/ }).first()).toBeVisible()   // en el teléfono el menú está en «Más»
    await page.goto('/wms/inspecciones')
    await expect(page.getByRole('heading', { name: 'Inspección de la unidad' })).toBeVisible()
    await page.getByTestId('inspeccion-vehiculo').selectOption({ index: 1 })
    await expect(page.getByTestId('inspeccion-formulario')).toBeVisible()
    await expect(page.getByTestId('inspeccion-punto')).toHaveCount(34)
    await sinDesborde(page)
    // un «No» pide la nota
    await page.getByTestId('marca-luces-NO').click()
    await expect(page.getByTestId('inspeccion-guardar')).toBeDisabled()
    await page.getByTestId('inspeccion-observaciones').fill('Luz trasera rota')
    await page.getByTestId('inspeccion-guardar').click()
    await expect(page.getByTestId('inspeccion-ya-hecha')).toContainText('NO conforme')
    const hoy = page.locator('[data-testid="inspeccion-dia"][data-estado="NO_CONFORME"]')
    await expect(hoy).toHaveCount(1)
    await expect(hoy.getByTestId('supervisar-inspeccion')).toHaveCount(0)   // la hizo el mismo conductor: la supervisa otro
    await expect(page.getByTestId('inspeccion-resumen')).toContainText('1 de')
    // la limpieza es otro formato
    await page.getByTestId('tipo-LIMPIEZA').click()
    await expect(page.getByTestId('inspeccion-punto')).toHaveCount(12)
    await page.getByTestId('inspeccion-guardar').click()
    await expect(page.getByTestId('inspeccion-ya-hecha')).toContainText('Salió conforme')

    // otra persona supervisa
    await entrarComo(page, 'auxiliar_transporte')
    await page.goto('/wms/inspecciones')
    await page.getByTestId('inspeccion-vehiculo').selectOption({ index: 1 })
    const dia = page.locator('[data-testid="inspeccion-dia"][data-estado="NO_CONFORME"]')
    await dia.getByTestId('supervisar-inspeccion').click()
    await expect(dia).toContainText('Supervisó')

    // el Word del mes
    const href = await page.getByTestId('descargar-word').getAttribute('href')
    const r = await page.request.get(href!)
    expect(r.status()).toBe(200)
    expect(r.headers()['content-type']).toContain('wordprocessingml.document')
    expect(r.headers()['content-disposition']).toContain('LS-FR.49.03')
    expect((await r.body()).subarray(0, 2).toString()).toBe('PK')
  })

  test('quien no tiene el permiso ve el aviso, no la pantalla', async ({ page }) => {
    await entrarComo(page, 'auxiliar')
    await page.goto('/wms/inspecciones')
    await expect(page.getByTestId('inspecciones-sin-permiso')).toBeVisible()
  })
})
