import { NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { exigirArea } from '@logisalud/auth/api'

export const dynamic = 'force-dynamic'

/**
 * Los datos del tablero, en una sola respuesta.
 *
 * Son DOS bases distintas, y por eso esta ruta existe en vez de que la
 * página consulte sola:
 *
 * - **comercial**: venta, líneas, productos, clasificación oro/plata/bronce
 *   y alertas de reposición. Sale de `dashboard_comercial_servidor()` en
 *   el proyecto de PEDIDOS, que es donde está el detalle por producto.
 *   Montos SIN IGV.
 * - **cobranzas**: cartera, morosidad y la venta mensual del ERP. Sale de
 *   cuatro vistas del proyecto CONSOLIDADO (cobranzas + compras). Montos
 *   CON IGV, porque es lo que guarda `documentos`.
 *
 * Las dos con service role y desde el servidor. La de pedidos porque la
 * versión pública de esa función exige estar en
 * `comercial.usuarios_dashboard` —una lista de correos aparte que había que
 * mantener a mano— y el envoltorio que la saltea solo se concedió a
 * `service_role`; la de cobranzas porque `v_saldos` y `documentos` tienen
 * RLS activado y sin policies. Quién puede ver el tablero lo decide
 * `exigirArea` acá arriba, con el perfil del ERP, y ya no hay dos listas de
 * acceso que se contradigan.
 */

const AREAS = ['gerencia', 'contabilidad', 'tesoreria', 'ventas'] as const

const VISTAS = [
  'v_dash_venta_mensual',
  'v_dash_cartera_vendedor',
  'v_dash_cobranza_kpi',
  'v_dash_cartera_actual',
] as const

type Vista = (typeof VISTAS)[number]

const NOMBRE: Record<Vista, string> = {
  v_dash_venta_mensual: 'venta_mensual',
  v_dash_cartera_vendedor: 'cartera_vendedor',
  v_dash_cobranza_kpi: 'kpi',
  v_dash_cartera_actual: 'cartera_actual',
}

/** Por qué columna ordenar para poder paginar sin repetir ni saltear filas. */
const ORDEN: Record<Vista, string> = {
  v_dash_venta_mensual: 'mes',
  v_dash_cartera_vendedor: 'codigo',
  v_dash_cobranza_kpi: 'cartera',
  v_dash_cartera_actual: 'ruc',
}

const PAGINA = 1000

/**
 * Lee una vista entera.
 *
 * Pagina siempre, aunque hoy solo `v_dash_cartera_actual` pase de 1.000
 * filas (son 1.095): PostgREST corta ahí **sin avisar**, y una lista
 * recortada en silencio es justo el error que dejó 2.022 clientes sin
 * ubigeo en el ERP de pedidos. El orden tiene que ser único o la página 2
 * repite filas de la 1.
 */
async function leerVista(db: SupabaseClient, vista: Vista): Promise<unknown[]> {
  const filas: unknown[] = []
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await db
      .from(vista)
      .select('*')
      .order(ORDEN[vista])
      .range(desde, desde + PAGINA - 1)
    if (error) throw new Error(`${vista}: ${error.message}`)
    const pagina = data ?? []
    filas.push(...pagina)
    if (pagina.length < PAGINA) return filas
  }
}

function cliente(url?: string, key?: string): SupabaseClient | null {
  const u = (url ?? '').trim()
  const k = (key ?? '').trim()
  if (!u || !k) return null
  return createClient(u, k, { auth: { persistSession: false } })
}

export async function GET() {
  const auth = await exigirArea(AREAS)
  if (!auth.ok) return auth.respuesta

  const dbCobranzas = cliente(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  )
  const dbPedidos = cliente(
    process.env.PEDIDOS_SUPABASE_URL,
    process.env.PEDIDOS_SUPABASE_SERVICE_ROLE_KEY,
  )

  const fallas: string[] = []

  // Las dos bases en paralelo: son independientes y manda la más lenta. Si
  // una falla, el tablero muestra la otra mitad y lo dice — media pantalla
  // sirve y una pantalla vacía no.
  const [comercial, cobranzas] = await Promise.all([
    (async () => {
      if (!dbPedidos) {
        fallas.push('Falta configurar PEDIDOS_SUPABASE_URL y PEDIDOS_SUPABASE_SERVICE_ROLE_KEY.')
        return null
      }
      const { data, error } = await dbPedidos.rpc('dashboard_comercial_servidor')
      if (error) {
        fallas.push(`dashboard_comercial_servidor: ${error.message}`)
        return null
      }
      return data
    })(),
    (async () => {
      if (!dbCobranzas) {
        fallas.push('Falta configurar NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.')
        return null
      }
      const salida: Record<string, unknown[]> = {}
      await Promise.all(
        VISTAS.map(async (vista) => {
          try {
            salida[NOMBRE[vista]] = await leerVista(dbCobranzas, vista)
          } catch (err) {
            fallas.push(err instanceof Error ? err.message : String(err))
            salida[NOMBRE[vista]] = []
          }
        }),
      )
      return salida
    })(),
  ])

  return NextResponse.json(
    {
      comercial,
      cobranzas,
      usuario: { nombre: auth.perfil.nombre, area: auth.perfil.area },
      fallas: fallas.length > 0 ? fallas : undefined,
      consultadoEn: new Date().toISOString(),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
