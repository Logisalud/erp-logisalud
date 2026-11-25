import { NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { exigirArea } from '@logisalud/auth/api'

import categorias from '@/datos/categorias.json'
import clientes from '@/datos/clientes.json'
import kpi from '@/datos/kpi.json'
import lineas from '@/datos/lineas.json'
import mensual from '@/datos/mensual.json'
import productos from '@/datos/productos.json'

/**
 * Los archivos vienen como `{rows: [...], meta: {...}}` —el formato en que
 * los dejó el análisis del Excel—. La página solo quiere las filas.
 */
function filas(archivo: { rows?: unknown[] }): unknown[] {
  return archivo.rows ?? []
}

const FIJOS = {
  categorias: filas(categorias),
  clientes: filas(clientes),
  kpi: filas(kpi),
  lineas: filas(lineas),
  mensual: filas(mensual),
  productos: filas(productos),
}

export const dynamic = 'force-dynamic'

/**
 * Los datos del tablero, en una sola respuesta.
 *
 * Dos mitades que no se parecen:
 *
 * - **Fija**: venta, líneas, productos y la clasificación oro/plata/bronce.
 *   Sale del Excel de ventas (hoja BDNubefact), el único lugar donde existe
 *   el detalle por producto — `documentos` guarda el total del comprobante,
 *   no sus ítems. Son archivos del repo y cambian cuando se regeneran.
 *   Montos SIN IGV.
 * - **Viva**: cartera, morosidad, venta mensual del ERP y a quién le
 *   pertenece hoy cada cliente. Sale de la base de cobranzas en cada
 *   pedido. Montos CON IGV, porque es lo que guarda `documentos`.
 *
 * Se lee con la service role key y no con la anon: `v_saldos` y
 * `documentos` tienen RLS activado y sin policies, así que el cliente
 * anónimo no lee nada. Quien entra ya pasó por el login y por `exigirArea`.
 */

const AREAS = ['gerencia', 'contabilidad', 'tesoreria', 'ventas'] as const

const VISTAS = [
  'v_dash_venta_mensual',
  'v_dash_cartera_vendedor',
  'v_dash_cobranza_kpi',
  'v_dash_cartera_actual',
] as const

type Vista = (typeof VISTAS)[number]

/** El nombre con el que la página pide cada conjunto. */
const NOMBRE: Record<Vista, string> = {
  v_dash_venta_mensual: 'venta_mensual_erp',
  v_dash_cartera_vendedor: 'cartera_vendedor',
  v_dash_cobranza_kpi: 'cobranza_kpi',
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

export async function GET() {
  const auth = await exigirArea(AREAS)
  if (!auth.ok) return auth.respuesta

  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim()
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim()
  if (!url || !key) {
    return NextResponse.json(
      {
        error:
          'Falta configurar el acceso a la base: NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.',
      },
      { status: 503 },
    )
  }

  const db = createClient(url, key, { auth: { persistSession: false } })

  // Las cuatro en paralelo: son independientes y manda la más lenta. Una
  // que falle no se lleva a las otras —el tablero muestra lo que sí pudo
  // traer y avisa del hueco— porque media pantalla sirve y una pantalla
  // vacía no.
  const vivo: Record<string, unknown[]> = {}
  const fallas: string[] = []
  await Promise.all(
    VISTAS.map(async (vista) => {
      try {
        vivo[NOMBRE[vista]] = await leerVista(db, vista)
      } catch (err) {
        fallas.push(err instanceof Error ? err.message : String(err))
        vivo[NOMBRE[vista]] = []
      }
    }),
  )

  return NextResponse.json(
    {
      fijos: FIJOS,
      vivo,
      fallas: fallas.length > 0 ? fallas : undefined,
      consultadoEn: new Date().toISOString(),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
