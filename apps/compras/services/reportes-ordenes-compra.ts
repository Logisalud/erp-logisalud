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
  /** Solo tiene valor cuando `estado === 'cerrada'` — distingue una OC 100%
   *  completada de un cierre manual con saldo que ya no se va a entregar
   *  (ver services/ordenes-compra.ts::cerrarOCConSaldoPendiente). */
  cierreTipo: 'completa' | 'saldo_no_entregado' | null
  cierreMotivo: string | null
  moneda: string
  total: number
  porcentajeRecibido: number
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
             cierre_tipo, cierre_motivo,
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

  const proveedores = await mapaProveedores([...new Set(filas.map((f: any) => f.proveedor_id))])

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
      cierreTipo: f.cierre_tipo,
      cierreMotivo: f.cierre_motivo,
      moneda: f.moneda,
      total: redondear(items.reduce((acc, i) => acc + Number(i.cantidad_pedida) * Number(i.precio_unitario), 0)),
      porcentajeRecibido: porcentajeRecibidoOC(
        items.map((i) => ({ cantidadPedida: Number(i.cantidad_pedida), cantidadRecibida: Number(i.cantidad_recibida) }))
      ),
    }
  })
}

async function mapaProveedores(ids: string[]) {
  const supabase = crearClienteServidor()
  if (ids.length === 0) return new Map<string, string>()
  const { data } = await supabase.schema('compras').from('proveedores').select('id, razon_social').in('id', ids)
  return new Map((data ?? []).map((p: any) => [p.id, p.razon_social as string]))
}

/*
 * `mapaDiscrepanciasAbiertasPorOC` y la columna "Discrepancias abiertas" se
 * retiraron el 2026-09-18. Contaban ítems con `tipo_discrepancia` sin fila en
 * `resoluciones_discrepancia`, y la recepción de tres columnas no escribe
 * ninguna de las dos cosas: la columna mostraba 0 en todas las filas, siempre.
 * Una columna que estructuralmente no puede decir otra cosa que "0" no
 * informa, tranquiliza.
 */

function redondear(n: number): number {
  return Number(`${Math.round(Number(`${n}e2`))}e-2`)
}
