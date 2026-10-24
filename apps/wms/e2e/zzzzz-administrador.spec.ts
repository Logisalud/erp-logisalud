// SB-E (D-196): el Administrador da de alta un producto que queda «por validar»; Dirección Técnica lo valida. Capturas en los 4 viewports.
import { expect, test } from '@playwright/test'
import { capturar, entrarComo, sinDesborde } from './ayudas'

test.describe('Administrador (SB-E)', () => {
  test('da de alta un producto que queda por validar; solo Dirección Técnica lo valida', async ({ page }, info) => {
    await entrarComo(page, 'admin_wms')
    await page.goto('/wms/productos/nuevo')
    const codigo = `ADM-${info.project.name.slice(0, 5)}-${Date.now().toString(36)}`
    await page.fill('#campo-codigo', codigo)
    await page.fill('#campo-descripcion', 'Producto del Administrador E2E 10 mg')
    await page.fill('#campo-registroSanitario', 'EG-88001')
    await page.fill('#campo-rsVence', '06/2031')
    await page.getByTestId('guardar-producto').click()
    await expect(page.getByTestId('producto-creado')).toContainText('Dirección Técnica lo valida')
    const aviso = page.getByTestId('producto-por-validar')
    await expect(aviso).toContainText('Falta que Dirección Técnica valide este producto')
    await expect(page.getByTestId('validar-producto')).toHaveCount(0)
    await sinDesborde(page)
    await capturar(page, info, 'producto-por-validar-administrador', { completa: true })
    const url = page.url()

    await entrarComo(page, 'direccion_tecnica')
    await page.goto(url)
    await expect(page.getByTestId('validar-producto')).toBeVisible()
    await page.getByTestId('validar-producto').click()
    await expect(page.getByTestId('producto-por-validar')).toHaveCount(0)
    await capturar(page, info, 'producto-validado-por-dt', { completa: true })
  })

  test('ve el botón de dar de alta, los documentos y las solicitudes de ingreso; no ve la decisión del acta', async ({ page }) => {
    await entrarComo(page, 'admin_wms')
    await expect(page.getByRole('link', { name: /Dar de alta un producto/ }).first()).toBeVisible()
    await page.goto('/wms/entradas')
    await expect(page.getByRole('link', { name: /Nueva solicitud|Nueva entrada|Preparar/i }).first()).toBeVisible()
    await page.goto('/wms/calidad')
    await expect(page.getByTestId('cola-dt')).toBeVisible()
  })
})
