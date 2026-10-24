// OS-1: Reserva de un lote (estado, no área) en los 4 viewports. Debe dejar el estado como lo encontró: el flujo de salidas corre después.
import { expect, test } from '@playwright/test'
import { capturar, entrarComo, esTelefono, sinDesborde } from './ayudas'

test.describe.configure({ mode: 'serial' })

async function abrirLoteDelPedido(page: import('@playwright/test').Page, info: import('@playwright/test').TestInfo) {
  await page.goto('/wms/salidas')
  const fila = page.getByTestId(esTelefono(info) ? 'fila-salida-movil' : 'fila-salida').filter({ hasText: 'PED-DEMO-101' })
  await (esTelefono(info) ? fila : fila.getByRole('link', { name: /^Abrir/ })).click()
  await expect(page.getByTestId('detalle-salida')).toBeVisible()
  await page.locator('[data-testid="lote-enlace"]:visible').first().click()
  await expect(page.getByTestId('panel-reserva')).toBeVisible()
}

test.describe('Reserva de un lote (OS-1)', () => {
  test('el Jefe de Transporte pone un lote en Reserva con motivo y la quita; queda la historia', async ({ page }, info) => {
    await entrarComo(page, 'jefe_transporte')
    await abrirLoteDelPedido(page, info)
    await expect(page.getByTestId('panel-reserva')).toContainText('El lote sigue Aprobado'.replace('El', 'En Reserva el'))
    await sinDesborde(page)
    await capturar(page, info, 'lote-reserva-libre', { completa: true })

    await page.getByTestId('poner-reserva').click()
    await expect(page.getByTestId('confirmar-reserva')).toBeDisabled()
    await page.getByTestId('motivo-reserva').fill('Observación del proveedor en revisión')
    await page.getByTestId('confirmar-reserva').click()
    await expect(page.getByTestId('reserva-vigente')).toContainText('Observación del proveedor en revisión')
    await expect(page.getByTestId('panel-reserva')).toContainText('En Reserva')
    await expect(page.getByTestId('aviso-ok')).toContainText('Siguiente: si tenía pedidos asignados')
    await sinDesborde(page)
    await capturar(page, info, 'lote-reserva-vigente', { completa: true })

    await page.getByTestId('quitar-reserva').click()
    await page.getByTestId('motivo-reserva').fill('Dirección Técnica revisó el COA')
    await page.getByTestId('confirmar-reserva').click()
    await expect(page.getByTestId('reserva-vigente')).toHaveCount(0)
    await expect(page.getByTestId('aviso-ok')).toContainText('Reserva quitada')
    await page.getByText(/Historia de Reservas/).click()
    await expect(page.getByTestId('historia-reservas')).toContainText('Observación del proveedor en revisión')
    await expect(page.getByTestId('historia-reservas')).toContainText('Dirección Técnica revisó el COA')
  })

  test('la asistente de DT y el auxiliar ven el panel pero no tienen el botón; Dirección Técnica sí', async ({ page }, info) => {
    await entrarComo(page, 'jefe_transporte')
    await abrirLoteDelPedido(page, info)
    const url = page.url()
    for (const rol of ['asistente_dt', 'auxiliar'] as const) {
      await entrarComo(page, rol)
      await page.goto(url)
      await expect(page.getByTestId('panel-reserva')).toBeVisible()
      await expect(page.getByTestId('poner-reserva')).toHaveCount(0)
    }
    await entrarComo(page, 'direccion_tecnica')
    await page.goto(url)
    await expect(page.getByTestId('poner-reserva')).toBeVisible()
  })
})
