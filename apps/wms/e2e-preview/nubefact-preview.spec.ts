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

/** Si ninguna salida está lista, arma una ruta por la pantalla (Jefe de Transporte) con un pedido conforme de la bandeja. Es de mejor esfuerzo: todo lo que pase se reporta y nada falla. */
async function avanzarUnaOrden(page: import('@playwright/test').Page, anota: (t: string) => void) {
  try {
    await page.goto('/wms/rutas', { timeout: 15_000 })
    await page.getByTestId('nueva-ruta').click({ timeout: 10_000 })
    await expect(page.getByTestId('editor-ruta')).toBeVisible({ timeout: 15_000 })
    await page.getByTestId('ruta-fecha').fill((await page.getByTestId('ruta-fecha').getAttribute('min'))!)
    await page.getByTestId('ruta-vehiculo').selectOption({ index: 1 })
    await page.getByTestId('ruta-conductor').selectOption({ index: 1 })
    const pedidos = page.getByTestId('pedido-disponible')
    if (!(await pedidos.count())) { anota('AVANCE: no hay pedidos por planificar en la bandeja; no se armó ruta.'); return }
    const preferido = pedidos.filter({ hasText: 'PED-DEMO-204' })
    await ((await preferido.count()) ? preferido : pedidos).first().getByTestId('agregar-pedido').click()
    for (let i = 0, n = await page.getByTestId('excepcion-corte').count(); i < n; i++) {
      await page.getByTestId('excepcion-corte').nth(i).check(); await page.getByTestId('excepcion-motivo').nth(i).fill('Prueba de Nubefact')
    }
    await page.getByTestId('guardar-plan').click({ timeout: 10_000 })
    await expect(page.getByTestId('ruta-ok')).toContainText('Plan guardado', { timeout: 20_000 })
    await page.getByTestId('confirmar-ruta').click({ timeout: 10_000 })
    await expect(page.getByTestId('ruta-ok')).toContainText('Ruta confirmada', { timeout: 20_000 })
    anota('AVANCE: se armó y confirmó una ruta con un pedido conforme de la bandeja (para que la guía tenga ruta, vehículo y conductor).')
  } catch (e) {
    anota(`AVANCE: no se pudo armar la ruta por pantalla (${limpio(String((e as Error).message)).slice(0, 160)}).`)
  }
}

test('conexión, guía de prueba y consulta con Nubefact desde la Preview', async ({ page, context, baseURL }) => {
  test.setTimeout(420_000)
  page.setDefaultTimeout(10_000) // nada se espera sin límite: lo lento (emitir, consultar) pone su propio plazo
  await context.addCookies([{ name: 'wms_demo_rol', value: 'jefe_transporte', url: baseURL! }])
  try {
    const r0 = await page.goto('/wms/salidas')
    expect(r0?.status(), 'la Preview no responde en /wms/salidas').toBeLessThan(500)
    let ids = [...new Set([...(await page.content()).matchAll(new RegExp(`/wms/salidas/(${UUID})`, 'g'))].map((m) => m[1]))]
    expect(ids.length, 'no hay salidas en la Preview (¿protegida por Vercel o sin ejemplos?)').toBeGreaterThan(0)

    // Candidatas: las salidas que muestran «Emitir guía». Se prueban con tiempos cortos (10 s cada una, 3 min en total) hasta hallar una con el botón habilitado.
    // En los ejemplos de la demo, «a-embalada» (PED-DEMO-206: conforme, embalada, en ruta, sin guía) es la que debería traer todo; el orden de la lista no importa.
    const inicio = Date.now()
    let primeraSinHabilitar: string | null = null
    let elegida: string | null = null
    for (let intento = 0; intento < 2 && !elegida; intento++) {
      if (intento === 1) {
        await avanzarUnaOrden(page, anota)
        await page.goto('/wms/salidas')
        ids = [...new Set([...(await page.content()).matchAll(new RegExp(`/wms/salidas/(${UUID})`, 'g'))].map((m) => m[1]))]
      }
      for (const id of ids.slice(0, 40)) {
        if (Date.now() - inicio > 180_000) { anota('BÚSQUEDA: se agotaron los 3 minutos buscando una salida lista para emitir.'); break }
        await page.goto(`/wms/salidas/${id}`, { timeout: 15_000 })
        const boton = page.getByTestId('emitir-guia-boton')
        if (!(await boton.count())) continue
        await page.getByTestId('modo-nubefact').waitFor({ timeout: 10_000 }).catch(() => null)
        if (await boton.isEnabled()) { elegida = id; break }
        const motivo = limpio(await page.getByTestId('guia-faltan').textContent({ timeout: 2_000 }).catch(() => null)) || '(sin aviso visible)'
        if (!primeraSinHabilitar) { primeraSinHabilitar = id; anota(`EMITIR DESHABILITADO en la primera candidata; faltan: ${motivo}`) }
        // Evidencia: si lo único que falta es lo que se escribe en la propia pantalla (licencia), se completa y se ve si el botón se habilita.
        if (/licencia/i.test(motivo) && (await page.getByTestId('licencia-conductor').count())) {
          await page.getByTestId('licencia-conductor').fill('Q12345678')
          if (await boton.isEnabled()) { anota('EVIDENCIA: el botón de emitir se habilitó al completar la licencia del conductor (Q12345678, dato de prueba).'); elegida = id; break }
          anota(`EVIDENCIA: con la licencia completa el botón sigue deshabilitado; faltan: ${limpio(await page.getByTestId('guia-faltan').textContent({ timeout: 2_000 }).catch(() => null))}`)
        }
      }
    }
    if (!elegida) {
      anota(primeraSinHabilitar ? 'RESULTADO: ninguna salida de la Preview está lista para emitir (ver los faltantes arriba). No es un fallo de Nubefact ni de infraestructura.' : 'RESULTADO: ninguna salida muestra «Emitir guía» (ninguna está conforme todavía).')
    } else {
      await page.goto(`/wms/salidas/${elegida}`, { timeout: 15_000 })
      if (!(await page.getByTestId('licencia-conductor').inputValue().catch(() => 'x'))) await page.getByTestId('licencia-conductor').fill('Q12345678').catch(() => null)
      const modo = limpio(await page.getByTestId('modo-nubefact').textContent())
      const real = await page.getByTestId('modo-nubefact').getAttribute('data-modo')
      anota(`MODO EN PANTALLA: ${modo} (data-modo=${real})`)
      anota(real === 'PRUEBA' ? 'RESULTADO: la Preview habla con Nubefact (modo prueba).' : real === 'SIMULADOR' ? 'RESULTADO: la Preview usa el SIMULADOR (faltan o no se leen NUBEFACT_RUTA / NUBEFACT_TOKEN en Preview).' : `RESULTADO: modo inesperado ${real}`)
      const destino = limpio(await page.getByTestId('conexion-destino').textContent({ timeout: 3_000 }).catch(() => null))
      if (destino) anota(`DESTINO EN «NUMERACIÓN DE GUÍAS»: ${destino}`)
      await page.getByTestId('probar-conexion-boton').click({ timeout: 10_000 })
      await expect(page.getByTestId('probar-conexion-resultado')).toBeVisible({ timeout: 45_000 })
      anota(`PROBAR CONEXIÓN: ${limpio(await page.getByTestId('probar-conexion-resultado').textContent())}`)

      await page.getByTestId('emitir-guia-boton').click({ timeout: 10_000 })
      const resultado = page.getByTestId('resultado-guia'); const error = page.getByTestId('error-emitir-guia')
      await expect(resultado.or(error)).toBeVisible({ timeout: 90_000 })
      if (await resultado.count()) anota(`EMITIR (resultado): ${limpio(await resultado.textContent())}`)
      else anota(`EMITIR (error de Nubefact o del WMS, texto exacto): ${limpio(await error.textContent())}`)
      anota(`SERIE-NÚMERO EMITIDA (para anular en el panel de Nubefact): ${limpio(await page.getByTestId('guia-numero').textContent({ timeout: 3_000 }).catch(() => null)) || 'ninguna'}`)
      const consultar = page.getByTestId('consultar-guia-boton')
      if (await consultar.count()) {
        await consultar.click({ timeout: 10_000 })
        const ok = page.getByTestId('resultado-guia'); const mal = page.getByTestId('error-consultar-guia')
        await expect(ok.or(mal)).toBeVisible({ timeout: 60_000 })
        anota(`CONSULTA (texto exacto): ${limpio(await (await mal.count() ? mal : ok).textContent())}`)
      } else anota('CONSULTA: no hay botón «Consultar» (la guía no quedó en espera de SUNAT).')
      anota(`ESTADO DE LA GUÍA: ${limpio(await page.getByTestId('guia-origen').textContent({ timeout: 3_000 }).catch(() => null))}`)
    }
  } finally {
    const f = process.env.GITHUB_STEP_SUMMARY
    if (f && lineas.length) appendFileSync(f, `## Nubefact desde la Preview (SB-F)\n\n${lineas.map((l) => `- ${l.replace(/\|/g, '/')}`).join('\n')}\n`)
  }
})
