// Stock del cliente (0067): la página pública con enlace (sin usuario), la descarga del Kardex y cómo el Administrador genera, copia y revoca el enlace.
import { expect, test } from '@playwright/test'
import { entrarComo, sinDesborde } from './ayudas'

test.describe.configure({ mode: 'serial' })

const TOKEN_DEMO = 'demo-stock-ajr_labs'

test.describe('stock del cliente', () => {
  test('con su enlace el cliente ve SU stock, sin menú ni banners de empleados, y no desborda', async ({ page }) => {
    await page.context().clearCookies()
    await page.goto(`/wms/stock/${TOKEN_DEMO}`)
    await expect(page.getByTestId('marco-publico')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Tu stock en LOGISALUD/i)
    await expect(page.getByTestId('stock-cliente')).toContainText('AJR')
    await expect(page.getByTestId('stock-resumen')).toContainText(/unidades/)
    await expect(page.getByTestId('banner-demo')).toHaveCount(0)
    await expect(page.getByRole('navigation')).toHaveCount(0)
    await expect(page.locator('body')).not.toContainText(/ubicaci|posici/i)
    await expect(page.getByTestId('stock-productos').locator('li[data-testid^="stock-producto-"]').first()).toBeVisible()
    await sinDesborde(page)
  })

  test('abre los lotes de un producto, con el vencimiento escrito', async ({ page }) => {
    await page.goto(`/wms/stock/${TOKEN_DEMO}`)
    const primero = page.getByTestId('stock-productos').locator('li[data-testid^="stock-producto-"]').first()
    await primero.getByRole('button').click()
    await expect(primero.getByRole('button')).toHaveAttribute('aria-expanded', 'true')
    const lote = primero.locator('tr[data-testid^="stock-lote-"]').first()
    await expect(lote).toBeVisible()
    await expect(lote).toContainText(/Vence en|Vencido hace|Vence hoy|Sin fecha/)
    await sinDesborde(page)
  })

  test('busca por producto y, sin resultados, ofrece volver a todo', async ({ page }) => {
    await page.goto(`/wms/stock/${TOKEN_DEMO}`)
    const total = await page.getByTestId('stock-productos').locator('li[data-testid^="stock-producto-"]').count()
    expect(total).toBeGreaterThan(1)
    await page.getByTestId('stock-buscar').fill('zzzz-no-existe')
    await expect(page.getByTestId('stock-sin-resultados')).toBeVisible()
    await page.getByTestId('stock-sin-resultados').getByRole('button', { name: /ver todo mi stock/i }).click()
    await expect(page.getByTestId('stock-productos').locator('li[data-testid^="stock-producto-"]')).toHaveCount(total)
  })

  test('descarga su Kardex en Excel con el modelo de Logisalud', async ({ page }) => {
    await page.goto(`/wms/stock/${TOKEN_DEMO}`)
    const [descarga] = await Promise.all([page.waitForEvent('download'), page.getByTestId('kardex-descargar').click()])
    expect(descarga.suggestedFilename()).toMatch(/^Kardex AJR_LABS \d{4}-\d{2}-\d{2}\.xlsx$/)
  })

  test('un enlace que no existe, vencido o revocado responde lo mismo y no muestra nada', async ({ page }) => {
    // los fallos cuentan por IP (límite de intentos): esta prueba usa una IP propia para no dejar en espera a las demás
    await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': `203.0.113.${Math.floor(Math.random() * 250) + 1}` })
    await page.goto('/wms/stock/este-enlace-no-existe')
    await expect(page.getByTestId('stock-enlace-invalido')).toContainText('no es válido o ya venció')
    await expect(page.getByTestId('stock-cliente')).toHaveCount(0)
    const r = await page.request.get('/wms/stock/este-enlace-no-existe/kardex')
    expect(r.status()).toBe(404)
    await page.context().setExtraHTTPHeaders({})
  })

  test('el Administrador genera el enlace de un cliente, el cliente lo abre y, al revocarlo, deja de abrir', async ({ page, browser }) => {
    const marca = `Prueba E2E ${Date.now()}`      // única: la demo guarda los enlaces de las pruebas anteriores
    await entrarComo(page, 'admin_wms')
    await page.goto('/wms/propietarios')
    const panel = page.locator('[data-testid^="enlace-stock-"]').first()
    await expect(panel).toBeVisible()
    await panel.getByTestId('enlace-etiqueta').fill(marca)
    await panel.getByTestId('enlace-vigencia').selectOption('30')
    await panel.getByTestId('enlace-generar').click()
    const nuevo = panel.getByTestId('enlace-nuevo')
    await expect(nuevo).toContainText('no se vuelve a mostrar')
    const url = await nuevo.getByTestId('enlace-url').inputValue()
    expect(url).toMatch(/\/wms\/stock\/[0-9a-f]{128}$/)
    await expect(panel.getByTestId('enlace-VIGENTE').filter({ hasText: marca })).toBeVisible()

    const cliente = await (await browser.newContext()).newPage()
    await cliente.goto(url)
    await expect(cliente.getByTestId('stock-cliente')).toBeVisible()

    await panel.getByTestId('enlace-VIGENTE').filter({ hasText: marca }).getByTestId('enlace-revocar').click()
    await expect(panel.getByTestId('enlace-REVOCADO').filter({ hasText: marca })).toBeVisible()
    await cliente.reload()
    await expect(cliente.getByTestId('stock-enlace-invalido')).toBeVisible()
    await cliente.context().close()
  })

  test('quien no es Administrador no ve los enlaces en Propietarios', async ({ page }) => {
    await entrarComo(page, 'jefe_almacen')
    await page.goto('/wms/propietarios')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Propietarios/i)
    await expect(page.locator('[data-testid^="enlace-stock-"]')).toHaveCount(0)
  })
})
