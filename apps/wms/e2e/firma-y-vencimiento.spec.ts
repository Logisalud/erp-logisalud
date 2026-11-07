// Piloto C y F en los 4 viewports (modo demostración): proveedor «solo mes y año», avisos al recibir, formato versionado y «sin material de envase».
// La firma en orden y el cuadro de firma se prueban en e2e/entradas.spec.ts (y en las capturas «entrada-firma-transportista»).
import { expect, test } from '@playwright/test'
import { capturar, entrarComo, sinDesborde } from './ayudas'

test.describe.configure({ mode: 'serial' })

test.describe('piloto F: vencimiento y formato', () => {
  test('Proveedores: Daré Pharma está marcado «solo mes y año» y Dirección Técnica puede cambiar la marca con motivo', async ({ page }, info) => {
    await entrarComo(page, 'asistente_dt')
    await page.goto('/wms/proveedores')
    await expect(page.getByRole('heading', { name: 'Proveedores' })).toBeVisible()
    const dare = page.getByTestId('fila-proveedor').filter({ hasText: 'Daré Pharma' })
    await expect(dare.getByTestId('marca-solo-mes-anio')).toBeVisible()
    await sinDesborde(page)
    await capturar(page, info, 'proveedores', { completa: true })
    const andina = page.getByTestId('fila-proveedor').filter({ hasText: 'Distribuidora Andina' })
    await andina.getByTestId('cambiar-marca').click()
    await andina.getByRole('button', { name: 'Guardar' }).click()
    await expect(andina.getByText('Cuéntanos por qué cambia')).toBeVisible()       // sin motivo no se guarda
    await andina.getByLabel(/Motivo/).fill('Sus envases solo traen mes y año')
    await andina.getByTestId('guardar-marca').click()
    await expect(andina.getByTestId('marca-solo-mes-anio')).toBeVisible()
  })

  test('el auxiliar no ve Proveedores', async ({ page }) => {
    await entrarComo(page, 'auxiliar')
    await page.goto('/wms/proveedores')
    await expect(page).toHaveURL(/\/wms\/?$/)
  })

  test('al recibir la compra de Daré Pharma: «06/2028 (solo mes y año)» y los avisos de verificar la fecha y de vida útil corta', async ({ page }, info) => {
    await entrarComo(page, 'jefe_almacen')
    await page.goto('/wms/entradas')
    await page.getByRole('link', { name: /OC-DEMO-0050/ }).filter({ visible: true }).first().click()
    await expect(page.getByTestId('titulo-solicitud')).toBeVisible()
    if (await page.getByTestId('iniciar-recepcion').count()) await page.getByTestId('iniciar-recepcion').click()
    const linea = page.getByTestId('linea-solicitud').first()
    await expect(linea.getByTestId('vence-linea')).toContainText('06/2028 (solo mes y año)')
    await expect(linea.getByTestId('aviso-VENCIMIENTO_VERIFICAR')).toContainText('Daré Pharma solo imprime mes y año')
    await expect(linea.getByTestId('aviso-VIDA_UTIL_CORTA')).toContainText('de vida útil')
    await sinDesborde(page)
    await capturar(page, info, 'recepcion-avisos-vencimiento', { completa: true })
  })

  test('el acta organoléptica muestra la versión del formato y la versión 2 espera a Dirección Técnica; al aprobarla, el producto «sin material de envase» no lo pide', async ({ page }, info) => {
    await entrarComo(page, 'direccion_tecnica')
    await page.goto('/wms/calidad')
    await page.locator('a[href*="/calidad/"]:visible').filter({ hasNot: page.locator('a[href*="muestreo"]') }).first().click()
    await expect(page.getByTestId('version-formato')).toContainText('LS-FR.55.02 · versión 1')
    await expect(page.getByTestId('panel-formato')).toContainText('Hoy rige la versión 1')
    await expect(page.getByText('III. Material del envase').first()).toBeVisible()
    await capturar(page, info, 'organoleptica-formato-version', { completa: true })
    await page.getByTestId('aprobar-version-2').click()
    await expect(page.getByTestId('panel-formato')).toHaveCount(0)
  })

  test('PIL-8: «Productos por completar» lista lo que falta y solo Dirección Técnica ve la marca de «sin material de envase»', async ({ page }) => {
    await entrarComo(page, 'asistente_dt')
    await page.goto('/wms/productos')
    await expect(page.getByTestId('ir-por-completar')).toContainText('por completar')
    await page.getByTestId('ir-por-completar').click()
    await expect(page.getByTestId('lista-por-completar')).toBeVisible()
    await expect(page.getByTestId('fila-por-completar').first()).toContainText('Falta:')
    await sinDesborde(page)
    await page.getByTestId('fila-por-completar').first().click()
    await expect(page.getByTestId('producto-pendiente-dt')).toContainText('Pendiente de Dirección Técnica')
    await expect(page.getByTestId('sin-material-envase')).toHaveCount(0)
    await entrarComo(page, 'direccion_tecnica')
    await page.goto('/wms/productos/por-completar')
    await page.getByTestId('fila-por-completar').first().click()
    await expect(page.getByTestId('sin-material-envase')).toBeVisible()
  })
})
