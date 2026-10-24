// Prueba de humo de TODOS los PDF contra la URL desplegada (Preview de Vercel). D-177.
// No entra por la pantalla de login ni abre navegador: en demostración la «sesión» es la cookie wms_demo_rol, que la config
// manda como header (rol jefe_transporte: ve salidas, rutas, picking, embalaje, calidad, bajas…). Solo usa el cliente HTTP de Playwright.
// Los ids no se escriben aquí: se descubren leyendo las listas de la propia Preview (la demo siembra ids deterministas, pero así
// la prueba no se rompe si cambian los ejemplos). Para cada tipo de PDF se prueban hasta N candidatos; pasa si alguno devuelve
// un PDF válido, y falla de inmediato ante cualquier error 5xx (eso es justo lo que esta prueba vigila).
import { expect, test, type APIRequestContext } from '@playwright/test'

const BASE = '/wms'
const MAX_CANDIDATOS = 8

test.skip(!process.env.WMS_PREVIEW_URL, 'Falta WMS_PREVIEW_URL (la URL de la Preview a probar).')

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const unicos = (xs: string[]) => [...new Set(xs)]

async function html(request: APIRequestContext, ruta: string): Promise<string> {
  const r = await request.get(`${BASE}${ruta}`)
  const cuerpo = await r.text()
  if (r.status() === 401 || /Authentication Required|vercel\.com\/sso-api/i.test(cuerpo.slice(0, 4000))) {
    throw new Error('La Preview está protegida por Vercel Authentication. Pon el secreto de «Protection Bypass for Automation» en VERCEL_AUTOMATION_BYPASS_SECRET.')
  }
  expect(r.status(), `${ruta} → ${r.status()}`).toBeLessThan(500)
  return cuerpo
}

/** Ids que aparecen en enlaces `…/<prefijo>/<uuid>` de una pantalla. */
async function idsEn(request: APIRequestContext, pantalla: string, prefijo: string): Promise<string[]> {
  const cuerpo = await html(request, pantalla)
  return unicos([...cuerpo.matchAll(new RegExp(`${BASE}/${prefijo}/(${UUID})`, 'g'))].map((m) => m[1])).slice(0, MAX_CANDIDATOS)
}

async function esPdf(request: APIRequestContext, ruta: string): Promise<'ok' | 'no-aplica'> {
  const r = await request.get(`${BASE}${ruta}`)
  const tipo = r.headers()['content-type'] ?? ''
  if (r.status() >= 500) throw new Error(`HTTP ${r.status()} en ${ruta}: ${(await r.text()).slice(0, 200)}`)
  if (r.status() === 200 && tipo.includes('application/pdf')) {
    const b = await r.body()
    expect(b.subarray(0, 5).toString(), `${ruta} no empieza con %PDF`).toBe('%PDF-')
    expect(b.length, `${ruta} es demasiado chico para ser un PDF`).toBeGreaterThan(1500)
    return 'ok'
  }
  // 404/403/400: esa orden no tiene ese documento (todavía). Se prueba con el siguiente candidato.
  return 'no-aplica'
}

async function alMenosUno(request: APIRequestContext, nombre: string, rutas: string[]) {
  expect(rutas.length, `«${nombre}»: no se encontró ningún candidato en las pantallas de la Preview`).toBeGreaterThan(0)
  for (const ruta of rutas) if ((await esPdf(request, ruta)) === 'ok') return
  throw new Error(`«${nombre}»: ningún candidato devolvió un PDF (probados: ${rutas.join(', ')})`)
}

test.describe('PDF en la Preview desplegada', () => {
  test('la Preview responde en modo demostración', async ({ request }) => {
    const cuerpo = await html(request, '/')
    expect(cuerpo, 'no se ve el banner DEMO: ¿es la URL correcta?').toContain('banner-demo')
  })

  test('hoja de picking', async ({ request }) => {
    const ids = await idsEn(request, '/picking', 'picking')
    await alMenosUno(request, 'hoja de picking', ids.map((i) => `/picking/${i}/hoja`))
  })

  test('paquete documental de la orden de salida', async ({ request }) => {
    const ids = await idsEn(request, '/salidas', 'salidas')
    await alMenosUno(request, 'paquete de la orden de salida', ids.map((i) => `/salidas/${i}/paquete`))
  })

  test('etiquetas de bultos', async ({ request }) => {
    const ids = unicos([...(await idsEn(request, '/embalaje', 'embalaje')), ...(await idsEn(request, '/salidas', 'salidas'))])
    await alMenosUno(request, 'etiquetas de bultos', ids.map((i) => `/embalaje/${i}/etiquetas`))
  })

  test('LS-FR.43.03 y paquete documental de la ruta', async ({ request }) => {
    const ids = await idsEn(request, '/rutas', 'rutas')
    await alMenosUno(request, 'LS-FR.43.03 (ruta)', ids.map((i) => `/rutas/${i}/pdf`))
    await alMenosUno(request, 'paquete documental de la ruta', ids.map((i) => `/rutas/${i}/paquete`))
  })

  test('orden de baja LS-FR.56.01', async ({ request }) => {
    const ids = await idsEn(request, '/bajas', 'bajas')
    await alMenosUno(request, 'orden de baja', ids.map((i) => `/bajas/${i}/pdf`))
  })

  test('acta organoléptica', async ({ request }) => {
    const ids = await idsEn(request, '/calidad', 'calidad')
    await alMenosUno(request, 'acta organoléptica', ids.map((i) => `/calidad/${i}/pdf`))
  })

  test('solicitud de ingreso y acta de recepción', async ({ request }) => {
    const ids = await idsEn(request, '/entradas', 'entradas')
    await alMenosUno(request, 'solicitud de ingreso', ids.map((i) => `/entradas/${i}/pdf`))
    const actas: string[] = []
    for (const id of ids) {
      const cuerpo = await html(request, `/entradas/${id}`)
      for (const m of cuerpo.matchAll(new RegExp(`${BASE}/entradas/${id}/acta/(${UUID})/pdf`, 'g'))) actas.push(`/entradas/${id}/acta/${m[1]}/pdf`)
    }
    await alMenosUno(request, 'acta de recepción', unicos(actas).slice(0, MAX_CANDIDATOS))
  })

  test('kardex', async ({ request }) => {
    // los ids de producto no son UUID (p. ej. «prod:1»)
    const cuerpo = await html(request, '/productos')
    const productos = unicos([...cuerpo.matchAll(new RegExp(`${BASE}/productos/([A-Za-z0-9:%_-]+)"`, 'g'))].map((m) => decodeURIComponent(m[1])).filter((x) => x !== 'nuevo')).slice(0, MAX_CANDIDATOS)
    await alMenosUno(request, 'kardex', productos.map((p) => `/kardex/pdf?producto=${encodeURIComponent(p)}`))
  })
})
