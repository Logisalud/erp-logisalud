// Rankings del mes (picking y conformidad) y «Cómo voy»: pantalla, reglas a la vista y sin desborde, en los 4 viewports.
import { expect, test } from '@playwright/test'
import { entrarComo, sinDesborde } from './ayudas'

test.describe('ranking del mes', () => {
  test('el Auxiliar ve cómo va, cómo se gana y las dos tablas', async ({ page }) => {
    await entrarComo(page, 'auxiliar')
    await page.goto('/wms/ranking')
    await expect(page.getByRole('heading', { name: 'Ranking del mes' })).toBeVisible()
    await expect(page.getByTestId('como-voy')).toBeVisible()
    await expect(page.getByTestId('como-voy-picking')).toContainText('Cómo voy')
    await expect(page.getByTestId('como-se-gana')).toContainText('máximo 3 de cada 100 pedidos con error')
    await expect(page.getByTestId('ranking-picking')).toBeVisible()
    await expect(page.getByTestId('ranking-conformidad')).toBeVisible()
    await expect(page.getByTestId('fila-ranking').first()).toBeVisible()
    await expect(page.getByTestId('ranking-ejemplo')).toBeVisible()
    await sinDesborde(page)
  })
})
