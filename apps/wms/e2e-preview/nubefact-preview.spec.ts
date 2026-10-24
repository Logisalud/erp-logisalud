// Nubefact (cuenta DEMO) contra la Preview DESPLEGADA (SB-F, D-210). Usa el navegador porque «Probar conexión» y «Emitir guía» son Server Actions.
// Corre con: WMS_PREVIEW_URL=<url> PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium npx playwright test -c playwright.preview.config.ts nubefact-preview
// Nunca imprime ni busca la ruta ni el token: solo comprueba que NO aparecen en pantalla y anota serie-número para anular en el panel de Nubefact.
import { expect, test } from '@playwright/test'

test.skip(!process.env.WMS_PREVIEW_URL, 'Falta WMS_PREVIEW_URL.')
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

test('conexión y guía de prueba con Nubefact (modo prueba)', async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: 'wms_demo_rol', value: 'jefe_transporte', url: baseURL! }])
  await page.goto('/wms/salidas')
  const html = await page.content()
  const ids = [...new Set([...html.matchAll(new RegExp(`/wms/salidas/(${UUID})`, 'g'))].map((m) => m[1]))]
  expect(ids.length, 'no hay salidas en la Preview').toBeGreaterThan(0)
  let encontrada = false
  for (const id of ids.slice(0, 30)) {
    await page.goto(`/wms/salidas/${id}`)
    if (!(await page.getByTestId('emitir-guia-boton').count())) continue
    encontrada = true
    await expect(page.getByTestId('modo-nubefact')).toContainText('Nubefact (modo prueba)')
    await page.getByTestId('probar-conexion-boton').click()
    const r = page.getByTestId('probar-conexion-resultado')
    await expect(r).toBeVisible({ timeout: 40_000 })
    console.log('PROBAR CONEXIÓN →', (await r.textContent())?.trim())
    await page.getByTestId('emitir-guia-boton').click()
    const res = page.getByTestId('resultado-guia')
    await expect(res.or(page.getByTestId('aviso-error').first())).toBeVisible({ timeout: 60_000 })
    console.log('EMITIR →', (await res.count() ? await res.textContent() : await page.getByTestId('aviso-error').first().textContent())?.trim())
    const numero = await page.getByTestId('guia-numero').textContent().catch(() => null)
    console.log('SERIE-NÚMERO (anular en el panel de Nubefact):', numero?.trim())
    expect(await page.content(), 'la pantalla no debe mostrar la ruta de Nubefact').not.toMatch(/https:\/\/[^"' ]*nubefact\.com\/api/i)
    break
  }
  expect(encontrada, 'ninguna salida está en el paso de la guía').toBe(true)
})
