// SB-A: «conductor en documentos» (temporal) y documento de identidad del personal, en los 4 viewports. La guía y el LS-FR.43.03 se comprueban en
// zzz-rutas-ordenes-manuales.spec.ts y rutas.spec.ts. Esta prueba deja el estado como lo encontró (Michele en los documentos).
import { expect, test } from '@playwright/test'
import { capturar, entrarComo, sinDesborde } from './ayudas'

test.describe.configure({ mode: 'serial' })

test.describe('conductor que figura en los documentos (SB-A)', () => {
  test('el Jefe de Transporte ve quién figura, lo cambia con motivo y lo vuelve a dejar', async ({ page }, info) => {
    await entrarComo(page, 'jefe_transporte')
    await page.goto('/wms/rutas/recursos')
    const panel = page.getByTestId('conductor-en-documentos')
    await expect(panel).toBeVisible()
    await expect(page.getByTestId('conductor-en-documentos-actual')).toContainText('Michele Yermain Mauriello Diaz')
    await expect(panel).toContainText('Esto es temporal')
    await expect(panel).toContainText('siempre guardan al conductor real')
    await expect(page.getByTestId('conductor-en-documentos-guardar')).toBeDisabled()
    await sinDesborde(page)
    await capturar(page, info, 'rutas-conductor-documentos', { completa: true })

    await page.getByTestId('conductor-en-documentos-persona').selectOption({ label: 'Hans' })
    // sin motivo se rechaza con una frase clara
    await page.getByTestId('conductor-en-documentos-guardar').click()
    await expect(page.getByText('Escribe el motivo.').first()).toBeVisible()
    await page.getByTestId('conductor-en-documentos-motivo').fill('Michele no puede esta semana')
    await page.getByTestId('conductor-en-documentos-guardar').click()
    await expect(page.getByTestId('conductor-en-documentos-actual')).toContainText('llevan a Hans')
    await expect(page.getByTestId('conductor-en-documentos-cambio')).toContainText('Michele no puede esta semana')
    await expect(panel).toContainText('Los documentos nuevos llevan a quien elegiste')
    await capturar(page, info, 'rutas-conductor-documentos-cambiado', { completa: true })

    // se deja como estaba
    await page.getByTestId('conductor-en-documentos-persona').selectOption({ label: 'Michele Yermain Mauriello Diaz' })
    await page.getByTestId('conductor-en-documentos-motivo').fill('Vuelve Michele')
    await page.getByTestId('conductor-en-documentos-guardar').click()
    await expect(page.getByTestId('conductor-en-documentos-actual')).toContainText('llevan a Michele Yermain Mauriello Diaz')
  })

  test('documento y licencia: Hans queda pendiente, Michele tiene carné de extranjería; las reglas se explican', async ({ page }, info) => {
    await entrarComo(page, 'jefe_transporte')
    await page.goto('/wms/rutas/recursos')
    const hans = page.getByTestId('fila-personal').filter({ hasText: /^Hans/ })
    await expect(hans.getByTestId('documentos-conductor')).toContainText('Documento pendiente')
    const michele = page.getByTestId('fila-personal').filter({ hasText: 'Michele Yermain' })
    await expect(michele.getByTestId('documentos-conductor')).not.toContainText('Documento pendiente')
    await michele.getByTestId('documentos-conductor').locator('summary').click()
    await expect(michele.getByTestId('documento-tipo')).toHaveValue('CE')
    await hans.getByTestId('documentos-conductor').locator('summary').click()
    await hans.getByTestId('documento-numero').fill('123')
    await hans.getByTestId('guardar-documentos').click()
    await expect(hans).toContainText('El DNI tiene 8 números.')
    await sinDesborde(page)
    await capturar(page, info, 'rutas-documento-conductor', { completa: true })
    await hans.getByTestId('documento-numero').fill('')
    await hans.getByTestId('guardar-documentos').click()
    await expect(hans).toContainText('Documento y licencia guardados.')
  })

  test('quien no es Jefe de Transporte lo ve pero no lo cambia', async ({ page }) => {
    await entrarComo(page, 'reemplazante_jefe')
    await page.goto('/wms/rutas/recursos')
    await expect(page.getByTestId('conductor-en-documentos')).toContainText('Solo el Jefe de Transporte lo cambia')
    await expect(page.getByTestId('conductor-en-documentos-guardar')).toHaveCount(0)
    await expect(page.getByTestId('documentos-conductor')).toHaveCount(0)
  })
})
