// Nubefact (cuenta DEMO) contra la Preview DESPLEGADA (SB-F, D-210/D-211). Usa el navegador porque «Probar conexión», «Emitir guía» y «Consultar» son Server Actions.
// Solo corre con WMS_NUBEFACT_PREVIEW=1 (lo pone el workflow manual wms-preview-nubefact.yml): así el workflow de PDF no emite guías en cada despliegue.
// REPORTA, no juzga: un error de negocio de Nubefact (ya existe, salto, rechazo…) se anota y la prueba pasa. Solo falla por infraestructura
// (la Preview no responde, no hay ninguna salida en el paso de la guía). Nunca imprime la ruta ni el token: solo textos de pantalla.
import { appendFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'

test.skip(!process.env.WMS_PREVIEW_URL || process.env.WMS_NUBEFACT_PREVIEW !== '1', 'Solo desde el workflow manual (WMS_NUBEFACT_PREVIEW=1 y WMS_PREVIEW_URL).')
test.describe.configure({ retries: 0 }) // un reintento emitiría otra guía
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

const lineas: string[] = []
function anota(t: string) {
  lineas.push(t); console.log(t)
}
// Defensa: si por error la pantalla trajera algo que parece la ruta de Nubefact, no se escribe.
const limpio = (t: string | null | undefined) => (t ?? '').replace(/\s+/g, ' ').trim().replace(/https?:\/\/\S+/gi, '[enlace]')

test('conexión, guía de prueba y consulta con Nubefact desde la Preview', async ({ page, context, baseURL }) => {
  test.setTimeout(240_000)
  await context.addCookies([{ name: 'wms_demo_rol', value: 'jefe_transporte', url: baseURL! }])
  try {
    const r0 = await page.goto('/wms/salidas')
    expect(r0?.status(), 'la Preview no responde en /wms/salidas').toBeLessThan(500)
    const ids = [...new Set([...(await page.content()).matchAll(new RegExp(`/wms/salidas/(${UUID})`, 'g'))].map((m) => m[1]))]
    expect(ids.length, 'no hay salidas en la Preview (¿protegida por Vercel o sin ejemplos?)').toBeGreaterThan(0)

    let hecha = false
    for (const id of ids.slice(0, 40)) {
      await page.goto(`/wms/salidas/${id}`)
      if (!(await page.getByTestId('emitir-guia-boton').count())) continue
      hecha = true
      const modo = limpio(await page.getByTestId('modo-nubefact').textContent())
      const real = await page.getByTestId('modo-nubefact').getAttribute('data-modo')
      anota(`MODO EN PANTALLA: ${modo} (data-modo=${real})`)
      anota(real === 'PRUEBA' ? 'RESULTADO: la Preview habla con Nubefact (modo prueba).' : real === 'SIMULADOR' ? 'RESULTADO: la Preview usa el SIMULADOR (faltan o no se leen NUBEFACT_RUTA / NUBEFACT_TOKEN en Preview).' : `RESULTADO: modo inesperado ${real}`)
      const destino = limpio(await page.getByTestId('conexion-destino').textContent().catch(() => null))
      if (destino) anota(`DESTINO EN «NUMERACIÓN DE GUÍAS»: ${destino}`)

      await page.getByTestId('probar-conexion-boton').click()
      await expect(page.getByTestId('probar-conexion-resultado')).toBeVisible({ timeout: 45_000 })
      anota(`PROBAR CONEXIÓN: ${limpio(await page.getByTestId('probar-conexion-resultado').textContent())}`)

      await page.getByTestId('emitir-guia-boton').click()
      const resultado = page.getByTestId('resultado-guia'); const error = page.getByTestId('error-emitir-guia')
      await expect(resultado.or(error)).toBeVisible({ timeout: 90_000 })
      if (await resultado.count()) anota(`EMITIR (resultado): ${limpio(await resultado.textContent())}`)
      else anota(`EMITIR (error de Nubefact o del WMS, texto exacto): ${limpio(await error.textContent())}`)
      const numero = limpio(await page.getByTestId('guia-numero').textContent().catch(() => null))
      anota(`SERIE-NÚMERO EMITIDA (para anular en el panel de Nubefact): ${numero || 'ninguna'}`)

      const consultar = page.getByTestId('consultar-guia-boton')
      if (await consultar.count()) {
        await consultar.click()
        const ok = page.getByTestId('resultado-guia'); const mal = page.getByTestId('error-consultar-guia')
        await expect(ok.or(mal)).toBeVisible({ timeout: 60_000 })
        anota(`CONSULTA (texto exacto): ${limpio(await (await mal.count() ? mal : ok).textContent())}`)
      } else anota('CONSULTA: no hay botón «Consultar» (la guía no quedó en espera de SUNAT).')
      anota(`ESTADO DE LA GUÍA: ${limpio(await page.getByTestId('guia-origen').textContent().catch(() => null))}`)
      break
    }
    expect(hecha, 'ninguna salida está en el paso de la guía (no hay botón «Emitir guía»)').toBe(true)
  } finally {
    const f = process.env.GITHUB_STEP_SUMMARY
    if (f && lineas.length) appendFileSync(f, `## Nubefact desde la Preview (SB-F)\n\n${lineas.map((l) => `- ${l.replace(/\|/g, '/')}`).join('\n')}\n`)
  }
})
