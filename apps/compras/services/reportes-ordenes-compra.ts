import 'server-only'
import { crearClienteServidor } from '@logisalud/auth/server'
import { porcentajeRecibidoOC } from '@/domain/reportes'
import type { EstadoOC, TipoOC } from '@/domain/orden-compra'

export type FiltrosReporteOC = {
  proveedorId?: string
  estado?: EstadoOC
  tipo?: TipoOC
  fechaDesde?: string
  fechaHasta?: string
}

export type FilaReporteOC = {
  id: string
  codigo: string
  proveedor: string
  tipo: TipoOC
  fechaEmision: string
  fechaEntregaEstimada: string | null
  estado: EstadoOC
  moneda: string
  total: number
  porcentajeRecibido: number
  discrepanciasAbiertas: number
}

/**
 * Reporte operativo de Órdenes de Compra — para Compras/Almacén. Se construye
 * solo, sin asumir nada del lado de Cuentas por Pagar (el ciclo OC →
 * Obligación todavía está en discusión — ver conversación con Sebas).
 */
export async function obtenerReporteOrdenesCompra(filtros: FiltrosReporteOC): Promise<FilaReporteOC[]> {
  const supabase = crearClienteServidor()

  let q = supabase
    .schema('compras')
    .from('ordenes_compra')
    .select(`id, codigo, tipo, estado, fecha_emision, fecha_entrega_estimada, moneda, proveedor_id,
             ordenes_compra_items(cantidad_pedida, precio_unitario, cantidad_recibida)`)
    .order('codigo', { ascending: false })
    .limit(500)

  if (filtros.proveedorId) q = q.eq('proveedor_id', filtros.proveedorId)
  if (filtros.estado) q = q.eq('estado', filtros.estado)
  if (filtros.tipo) q = q.eq('tipo', filtros.tipo)
  if (filtros.fechaDesde) q = q.gte('fecha_emision', filtros.fechaDesde)
  if (filtros.fechaHasta) q = q.lte('fecha_emision', filtros.fechaHasta)

  const { data, error } = await q
  if (error) throw new Error(`No se pudo armar el reporte de órdenes de compra: ${error.message}`)
  const filas = data ?? []

  const [proveedores, discrepancias] = await Promise.all([
    mapaProveedores([...new Set(filas.map((f: any) => f.proveedor_id))]),
    mapaDiscrepanciasAbiertasPorOC(filas.map((f: any) => f.id)),
  ])

  return filas.map((f: any) => {
    const items = (f.ordenes_compra_items ?? []) as { cantidad_pedida: number; precio_unitario: number; cantidad_recibida: number }[]
    return {
      id: f.id,
      codigo: f.codigo,
      proveedor: proveedores.get(f.proveedor_id) ?? 'proveedor no legible',
      tipo: f.tipo,
      fechaEmision: f.fecha_emision,
      fechaEntregaEstimada: f.fecha_entrega_estimada,
      estado: f.estado,
      moneda: f.moneda,
      total: redondear(items.reduce((acc, i) => acc + Number(i.cantidad_pedida) * Number(i.precio_unitario), 0)),
      porcentajeRecibido: porcentajeRecibidoOC(
        items.map((i) => ({ cantidadPedida: Number(i.cantidad_pedida), cantidadRecibida: Number(i.cantidad_recibida) }))
      ),
      discrepanciasAbiertas: discrepancias.get(f.id) ?? 0,
    }
  })
}

async function mapaProveedores(ids: string[]) {
  const supabase = crearClienteServidor()
  if (ids.length === 0) return new Map<string, string>()
  const { data } = await supabase.schema('compras').from('proveedores').select('id, razon_social').in('id', ids)
  return new Map((data ?? []).map((p: any) => [p.id, p.razon_social as string]))
}

/**
 * Discrepancia "abierta" = un ítem de recepción con `tipo_discrepancia`
 * distinto de 'ninguna'/null que todavía no tiene una fila en
 * `resoluciones_discrepancia` — nadie la resolvió todavía.
 */
async function mapaDiscrepanciasAbiertasPorOC(ocIds: string[]) {
  const supabase = crearClienteServidor()
  const resultado = new Map<string, number>()
  if (ocIds.length === 0) return resultado

  const { data: recepciones } = await supabase.schema('almacen').from('recepciones').select('id, oc_id').in('oc_id', ocIds)
  const ocPorRecepcion = new Map((recepciones ?? []).map((r: any) => [r.id, r.oc_id]))
  const recepcionIds = [...ocPorRecepcion.keys()]
  if (recepcionIds.length === 0) return resultado

  const { data: items } = await supabase
    .schema('almacen')
    .from('recepciones_items')
    .select('id, recepcion_id, tipo_discrepancia')
    .in('recepcion_id', recepcionIds)
    .not('tipo_discrepancia', 'is', null)
    .neq('tipo_discrepancia', 'ninguna')
  const itemsConDiscrepancia = items ?? []
  if (itemsConDiscrepancia.length === 0) return resultado

  const { data: resueltos } = await supabase
    .schema('almacen')
    .from('resoluciones_discrepancia')
    .select('recepcion_item_id')
    .in('recepcion_item_id', itemsConDiscrepancia.map((i: any) => i.id))
  const idsResueltos = new Set((resueltos ?? []).map((r: any) => r.recepcion_item_id))

  for (const item of itemsConDiscrepancia as any[]) {
    if (idsResueltos.has(item.id)) continue
    const ocId = ocPorRecepcion.get(item.recepcion_id)
    if (!ocId) continue
    resultado.set(ocId, (resultado.get(ocId) ?? 0) + 1)
  }
  return resultado
}

function redondear(n: number): number {
  return Number(`${Math.round(Number(`${n}e2`))}e-2`)
}
