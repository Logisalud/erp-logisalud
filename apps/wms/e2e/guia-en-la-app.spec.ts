// OS-4: la guía dentro de la app. Cada orden dice dónde va, qué sigue y quién lo hace; Inicio trae «Mis tareas»; el recorrido se abre la primera vez y se puede volver a ver.
import { expect, test } from '@playwright/test'
import { capturar, entrarComo, esTelefono, sinDesborde } from './ayudas'

test.describe('guía dentro de la app (OS-4)', () => {
  test('Inicio: el recorrido se abre la primera vez, se cierra y se puede volver a ver; «Mis tareas» lista lo del Jefe de Transporte con su botón', async ({ page }, info) => {
    await entrarComo(page, 'jefe_transporte')
    await page.goto('/wms')
    await expect(page.getByTestId('recorrido')).toBeVisible()
    await sinDesborde(page)
    await capturar(page, info, 'guia-recorrido', { completa: true })
    await page.getByTestId('siguiente-recorrido').click()
    await expect(page.getByTestId('recorrido')).toContainText('2 de 5')
    await page.getByTestId('cerrar-recorrido').click()
    await expect(page.getByTestId('recorrido')).toHaveCount(0)
    await page.reload()
    await expect(page.getByTestId('recorrido')).toHaveCount(0)             // ya lo vio: no vuelve a abrirse solo
    await page.getByTestId('ver-recorrido').click()
    await expect(page.getByTestId('recorrido')).toContainText('1 de 5')    // pero se puede revisitar
    await page.getByTestId('cerrar-recorrido').click()

    await expect(page.getByTestId('mis-tareas')).toBeVisible()
    const tarea = page.getByTestId('tarea').first()
    await expect(tarea).toBeVisible()
    await expect(tarea).toContainText('Va en:')
    await sinDesborde(page)
    await capturar(page, info, 'guia-mis-tareas', { completa: true })
  })

  test('Inicio sin tareas dice «No tienes tareas pendientes»', async ({ page }) => {
    await entrarComo(page, 'auditoria_lectura')
    await page.goto('/wms')
    await expect(page.getByTestId('sin-tareas')).toContainText('No tienes tareas pendientes')
  })

  test('la orden muestra sus pasos, quién hace el siguiente y un botón directo; la lista dice qué sigue en cada orden', async ({ page }, info) => {
    await entrarComo(page, 'jefe_transporte')
    await page.goto('/wms/salidas')
    if (!esTelefono(info)) await expect(page.getByTestId('siguiente-salida').first()).toContainText('Lo hace:')
    const fila = page.getByTestId(esTelefono(info) ? 'fila-salida-movil' : 'fila-salida').filter({ hasText: 'PED-DEMO-101' })
    await (esTelefono(info) ? fila : fila.getByRole('link', { name: /^Abrir/ })).click()
    const avance = page.getByTestId('avance-pasos')
    await expect(avance).toBeVisible()
    await expect(page.getByTestId('avance-pasos-pasos').locator('li')).toHaveCount(7, { timeout: 5000 }).catch(async () => { await expect(page.getByTestId('avance-pasos-pasos').locator('li')).toHaveCount(6) })
    await expect(page.getByTestId('avance-pasos-texto')).not.toBeEmpty()
    await expect(page.getByTestId('avance-pasos-quien')).toContainText('Lo hace:')
    await expect(page.getByTestId('avance-pasos-boton')).toBeVisible()
    await sinDesborde(page)
    await capturar(page, info, 'guia-avance-orden', { completa: true })
  })

  test('un ingreso también dice qué sigue y quién lo hace', async ({ page }, info) => {
    await entrarComo(page, 'direccion_tecnica')
    await page.goto('/wms/entradas')
    await page.locator('a[href*="/entradas/"]').filter({ hasNotText: 'Nueva' }).first().click()
    await expect(page.getByTestId('avance-ingreso')).toBeVisible()
    await expect(page.getByTestId('avance-ingreso-texto')).not.toBeEmpty()
    await sinDesborde(page)
    await capturar(page, info, 'guia-avance-ingreso', { completa: true })
  })
})
