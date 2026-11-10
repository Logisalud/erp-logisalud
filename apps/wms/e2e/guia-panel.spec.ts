// Piloto (0036): con `guia_modo = PANEL` la guía se emite en el panel de Nubefact y el WMS solo la registra. Corre en su propio servidor de la demo (WMS_DEMO_GUIA_MODO=PANEL, puerto +3).
import { expect, test } from '@playwright/test'
import { capturar, entrarComo, esTelefono, sinDesborde } from './ayudas'

test.describe.configure({ mode: 'serial' })

test.describe('guía emitida en el panel (piloto)', () => {
  test('picking y conformidad como siempre; la documentación pide registrar la guía y no ofrece «Emitir guía»', async ({ page }, info) => {
    await entrarComo(page, 'jefe_transporte')
    await page.goto('/wms/salidas')
    const fila = page.getByTestId(esTelefono(info) ? 'fila-salida-movil' : 'fila-salida').filter({ hasText: 'PED-DEMO-101' })
    await (esTelefono(info) ? fila : fila.getByRole('link', { name: /^Abrir/ })).click()
    await page.getByTestId('generar-picking').click()
    await expect(page.getByTestId('orden-picking')).toBeVisible()
    const urlOrden = page.url()

    await entrarComo(page, 'auxiliar')
    await page.goto(urlOrden)
    await expect(page.getByTestId('linea-picking').first()).toBeVisible()
    for (let n = await page.getByTestId('pickeado').count(); n > 0; n--) {
      await page.getByTestId('pickeado').first().click()
      await expect(page.getByTestId('pickeado')).toHaveCount(n - 1)      // espera a que la pantalla se refresque antes del siguiente clic
    }
    await expect(page.getByTestId('avance-picking')).toContainText('Picking completo')

    await entrarComo(page, 'asistente_dt')
    await page.goto('/wms/conformidad')
    await page.getByTestId('orden-cola').first().click()
    await page.getByTestId('bultos').fill('2')
    await page.getByTestId('dar-conformidad').click()
    await expect(page.getByTestId('conformidad-hecha')).toContainText('Conformidad registrada')

    await entrarComo(page, 'jefe_transporte')
    await page.goto('/wms/salidas')
    const fila2 = page.getByTestId(esTelefono(info) ? 'fila-salida-movil' : 'fila-salida').filter({ hasText: 'PED-DEMO-101' })
    await (esTelefono(info) ? fila2 : fila2.getByRole('link', { name: /^Abrir/ })).click()
    await expect(page.getByTestId('panel-documentacion')).toBeVisible()
    await expect(page.getByTestId('registrar-guia-panel')).toBeVisible()
    await expect(page.getByTestId('emitir-guia')).toHaveCount(0)
    await expect(page.getByTestId('modo-guia-panel')).toContainText('panel de Nubefact')
    await sinDesborde(page)
    await capturar(page, info, 'guia-panel-registrar', { completa: true })

    await expect(page.getByTestId('registrar-guia-panel-boton')).toBeDisabled()
    await page.getByTestId('panel-numero').fill('1234')
    await expect(page.getByTestId('panel-error-numero')).toContainText('T001-00001234')
    await expect(page.getByTestId('registrar-guia-panel-boton')).toBeDisabled()
    await page.getByTestId('panel-numero').fill('ttt1-00000012')
    await page.getByTestId('panel-enlace').fill('https://panel.nubefact.test/guia-12.pdf')
    await page.getByTestId('registrar-guia-panel-boton').click()
    await expect(page.getByTestId('resultado-guia')).toContainText('Siguiente')
    await expect(page.getByTestId('guia-numero')).toHaveText('TTT1-00000012')
    await expect(page.getByTestId('guia-origen')).toContainText('panel de Nubefact')
    await expect(page.getByTestId('guia-fecha-emision')).toBeVisible()
    await expect(page.getByTestId('avisos-pedidos')).toContainText('TTT1-00000012')
    await expect(page.getByTestId('registrar-guia-panel')).toHaveCount(0)
    await sinDesborde(page)
    await capturar(page, info, 'guia-panel-registrada', { completa: true })
  })
})
