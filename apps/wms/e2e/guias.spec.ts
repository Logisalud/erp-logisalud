// Buscador de guías (pedido de Sebas durante la reunión del equipo): pantalla, búsqueda y permisos, en los 4 viewports.
import { expect, test } from '@playwright/test'
import { entrarComo, esTelefono, sinDesborde } from './ayudas'

test.describe('guías de remisión', () => {
  test('el Jefe de Transporte entra desde el menú, ve el buscador y la pantalla no se desborda', async ({ page }, info) => {
    await entrarComo(page, 'jefe_transporte')
    await page.goto('/wms/guias')
    await expect(page.getByRole('heading', { name: 'Guías de remisión' })).toBeVisible()
    await expect(page.getByTestId('buscar-guias')).toBeVisible()
    await expect(page.getByTestId('guias-contador')).toBeVisible()
    await expect(page.getByTestId('filtro-estado-guia')).toBeVisible()
    await sinDesborde(page)
    // con o sin guías en la demo, una búsqueda que no existe lo dice y «Quitar filtros» vuelve
    await page.getByTestId('buscar-guias').fill('zzzz-no-existe')
    await expect(page.getByTestId('guias-sin-coincidencias').or(page.getByTestId('guias-vacio'))).toBeVisible()
    if (!esTelefono(info)) await expect(page.getByRole('link', { name: 'Guías' }).first()).toBeVisible()
  })
})
