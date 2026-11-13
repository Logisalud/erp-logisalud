// Seguimiento al cliente (0069): la pantalla del Administrador (teléfonos de vendedores y opciones) y la pantalla pública del cliente (pedido + RUC).
// Corre en su propio servidor de la demo (WMS_DEMO_SEGUIMIENTO=1 y modo piloto, puerto +5): ver playwright.config.ts y scripts/e2e-por-viewport.sh.
import { expect, test } from '@playwright/test'
import { entrarComo, sinDesborde } from './ayudas'

test.describe.configure({ mode: 'serial' })

const PEDIDO = 'PED-DEMO-101'
const RUC = '20512345671'          // Botica Salud Total SAC
const NUMERO_REAL_DE_ROSA = '987654321'
const NUMERO_DE_PRUEBA = '992016073'

test.describe('seguimiento al cliente · Administrador', () => {
  test('solo el Administrador abre la pantalla; otros roles vuelven al Inicio', async ({ page }) => {
    await entrarComo(page, 'jefe_transporte')
    await page.goto('/wms/contactos-vendedores')
    await expect(page).toHaveURL(/\/wms\/?(bienvenida\/?)?$/)
  })

  test('guarda el teléfono de un vendedor (se normaliza a +51), rechaza uno mal escrito y no desborda', async ({ page }) => {
    await entrarComo(page, 'admin_wms')
    await page.goto('/wms/contactos-vendedores')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Seguimiento a clientes/i)
    await expect(page.getByTestId('cv-vacio')).toBeVisible()
    await page.getByTestId('cv-nombre').fill('Rosa Paredes')
    await page.getByTestId('cv-telefono').fill('12345')
    await page.getByTestId('cv-guardar').click()
    await expect(page.getByTestId('seg-error')).toContainText('9 dígitos')
    await page.getByTestId('cv-telefono').fill('987 654 321')
    await page.getByTestId('cv-guardar').click()
    await expect(page.getByTestId('cv-tabla')).toContainText('Rosa Paredes')
    await expect(page.getByTestId('cv-tabla')).toContainText('+51 987 654 321')
    await sinDesborde(page)
  })

  test('el CSV guarda las filas buenas y dice cuáles no sirven, sin frenar todo', async ({ page }) => {
    await entrarComo(page, 'admin_wms')
    await page.goto('/wms/contactos-vendedores')
    await page.getByTestId('cv-csv').setInputFiles({ name: 'vendedores.csv', mimeType: 'text/csv', buffer: Buffer.from('Nombre,Teléfono\nLuis Vargas,922121178\nMal Teléfono,123\n') })
    await expect(page.getByTestId('cv-resultado')).toContainText('Se guardaron 1')
    await expect(page.getByTestId('cv-resultado')).toContainText('Fila 2')
    await expect(page.getByTestId('cv-tabla')).toContainText('Luis Vargas')
  })

  test('las opciones se guardan: número de prueba, guía visible y «Van X de Y»', async ({ page }) => {
    await entrarComo(page, 'admin_wms')
    await page.goto('/wms/contactos-vendedores')
    await expect(page.locator('body')).not.toContainText(/contacto público/i)   // no existe un contacto público de Logisalud
    const prueba = page.getByTestId('op-whatsappPrueba')
    await prueba.fill('992 016 073'); await prueba.blur()
    await expect(page.getByTestId('seg-ok')).toContainText('Guardado')
    await page.getByTestId('op-guia').selectOption('DESPUES_ENTREGA')
    await expect(page.getByTestId('seg-ok')).toContainText('Guardado')
    await page.getByTestId('op-guia').selectOption('SIEMPRE')
    await page.getByTestId('op-ruta').uncheck(); await page.getByTestId('op-ruta').check()
    await page.reload()
    await expect(page.getByTestId('op-whatsappPrueba')).toHaveValue('+51992016073')
    await expect(page.getByTestId('op-guia')).toHaveValue('SIEMPRE')
  })
})

test.describe('seguimiento al cliente · pantalla pública', () => {
  test.beforeEach(async ({ page }) => {
    // los fallos cuentan por IP (límite de intentos): cada prueba usa una IP propia para no dejar en espera a las demás
    await page.context().clearCookies()
    await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': `203.0.113.${Math.floor(Math.random() * 250) + 1}` })
  })
  test.afterEach(async ({ page }) => { await page.context().setExtraHTTPHeaders({}) })

  const consultar = async (page: import('@playwright/test').Page, pedido: string, ruc: string) => {
    await page.goto('/wms/seguimiento')
    await page.getByTestId('seguimiento-pedido').fill(pedido)
    await page.getByTestId('seguimiento-ruc').fill(ruc)
    await page.getByTestId('seguimiento-consultar').click()
  }

  test('RUC que no es del pedido, o pedido que no existe: el mismo mensaje y ningún dato', async ({ page }) => {
    await consultar(page, PEDIDO, '20999999999')
    const malo = await page.getByTestId('seguimiento-no-encontrado').innerText()
    await expect(page.getByTestId('pantalla-seguimiento')).toHaveCount(0)
    await consultar(page, 'PED-NO-EXISTE', RUC)
    await expect(page.getByTestId('seguimiento-no-encontrado')).toHaveText(malo)
    await expect(page.locator('body')).not.toContainText('Botica Salud Total')
  })

  test('después de varios intentos fallidos con un mismo pedido pide esperar, con lenguaje llano', async ({ page }) => {
    // un pedido propio: el límite por pedido (5 fallos) bloquearía el pedido de las demás pruebas
    const otro = `PED-ESPERA-${Math.floor(Math.random() * 9000) + 1000}`
    for (let i = 0; i < 6; i++) {
      await consultar(page, otro, `2000000000${i}`)
      await expect(page.locator('[data-testid="seguimiento-no-encontrado"],[data-testid="seguimiento-espera"]')).toBeVisible()
    }
    await expect(page.getByTestId('seguimiento-espera')).toContainText(/espera \d+ minuto/)
    await expect(page.getByTestId('pantalla-seguimiento')).toHaveCount(0)
  })

  test('con pedido y RUC correctos: encabezado, aviso de PRUEBA, mensaje grande, pasos y estado de pagos; sin desborde', async ({ page }) => {
    await consultar(page, PEDIDO, RUC)
    await expect(page.getByTestId('pantalla-seguimiento')).toBeVisible()
    await expect(page.getByTestId('seguimiento-prueba')).toContainText('PRUEBA')
    await expect(page.getByTestId('seguimiento-encabezado')).toContainText(`Pedido ${PEDIDO}`)
    await expect(page.getByTestId('seguimiento-encabezado')).toContainText('Botica Salud Total')
    await expect(page.getByTestId('mensaje-titulo')).toBeVisible()
    expect(await page.getByTestId('paso-seguimiento').count()).toBeGreaterThanOrEqual(3)
    await expect(page.getByTestId('estado-pagos')).toBeVisible()
    await expect(page.getByRole('navigation')).toHaveCount(0)
    await expect(page.locator('body')).not.toContainText(/Farmacia Los Ángeles|Clínica San Marcos/)   // nada de otros pedidos
    await sinDesborde(page)
  })

  test('«Escribir a mi vendedor» abre WhatsApp con el mensaje; en piloto va al número de prueba, nunca al del vendedor', async ({ page }) => {
    await consultar(page, PEDIDO, RUC)
    const boton = page.getByTestId('boton-escribir')
    await expect(boton).toBeVisible()
    await expect(boton).toContainText('Escribir a mi vendedor')
    const href = (await boton.getAttribute('href'))!
    expect(href).toContain(`https://wa.me/51${NUMERO_DE_PRUEBA}`)
    expect(href).not.toContain(NUMERO_REAL_DE_ROSA)
    expect(decodeURIComponent(href.split('text=')[1])).toBe(`Hola Rosa, consulto por mi pedido ${PEDIDO}`)
    await expect(boton).toHaveAttribute('rel', /noopener/)
    await expect(page.locator('body')).not.toContainText(NUMERO_REAL_DE_ROSA)
  })

  test('el paso actual late con movimiento normal y se queda quieto con «reducir movimiento»', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await consultar(page, PEDIDO, RUC)
    const actual = page.getByTestId('paso-actual')
    await expect(actual).toBeVisible()
    expect(await actual.evaluate((el) => getComputedStyle(el).animationName)).toContain('latido')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    expect(await actual.evaluate((el) => getComputedStyle(el).animationName)).toBe('none')
    // nunca solo color: el paso actual también se dice con texto
    await expect(page.getByTestId('paso-seguimiento').filter({ has: actual })).toContainText('paso actual')
  })

  test('la página no se indexa y no manda referencia', async ({ page }) => {
    await page.goto('/wms/seguimiento')
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
    await expect(page.locator('meta[name="referrer"]')).toHaveAttribute('content', 'no-referrer')
  })
})
