import 'server-only'

import { crearClienteServidor } from '@logisalud/auth/server'
import { ordenPaginado } from './claves'

// PostgREST no embebe entre schemas: cada tabla se lee por separado y se une acá
// (mismo criterio que mapaProductos() en apps/compras). Las lecturas pasan por RLS
// con la sesión de la persona; ningún cliente usa service role.

export const PAGINA = 1000

export type Fila = Record<string, unknown>

export const s = (v: unknown) => (v == null ? undefined : String(v))
export const n = (v: unknown) => (v == null ? null : Number(v))
export const num = (v: unknown) => (v == null ? undefined : Number(v))

/**
 * Lee una tabla completa por páginas de 1.000 filas (tope de PostgREST). El orden es siempre
 * determinista: `ordenPrevio` (opcional, para que el resultado salga en un orden útil) y, al final,
 * la clave única de la tabla (`claves.ts`). Sin eso las páginas pueden repetir o perder filas.
 */
export async function traerTodo(
  tabla: string,
  schema: 'wms' | 'catalogo',
  seleccion = '*',
  ordenPrevio: readonly string[] = [],
): Promise<Fila[]> {
  const orden = ordenPaginado(tabla, schema, ordenPrevio)
  const supabase = crearClienteServidor()
  const out: Fila[] = []
  for (let desde = 0; ; desde += PAGINA) {
    let q = supabase.schema(schema).from(tabla).select(seleccion)
    for (const columna of orden) q = q.order(columna)
    const { data, error } = await q.range(desde, desde + PAGINA - 1)
    if (error) throw new Error(`No se pudo leer ${schema}.${tabla}: ${error.message}`)
    out.push(...((data ?? []) as unknown as Fila[]))
    if (!data || data.length < PAGINA) break
  }
  return out
}

/** Llama a una función del schema wms con la sesión de la persona (RLS y roles los aplica la base). */
export async function rpc(nombre: string, args: Record<string, unknown>) {
  const supabase = crearClienteServidor()
  return supabase.schema('wms').rpc(nombre, args)
}

/** Los mensajes de las funciones SQL ya están en español para personas; el resto, un texto genérico. */
export function mensajeHumano(error: { code?: string; message: string }): string {
  if (error.code === '42501') return error.message || 'No tienes permiso para hacer esto.'
  if (error.code === '23505' || error.code === 'P0001' || error.code === 'P0002') return error.message
  return 'No pudimos guardar el cambio. Intenta de nuevo; si sigue igual, avisa a quien administra el WMS.'
}
