import 'server-only'
import { crearClienteServidor } from '@logisalud/auth/server'
import {
  etiquetaEstado,
  ordenPendiente,
  siguientePasoOC,
  siguientePasoOS,
  type TipoOrdenUnificada,
} from '@/domain/ordenes-unificadas'
import type { EstadoOC } from '@/domain/orden-compra'
import type { EstadoOS } from '@/domain/servicio'

/**
 * Visor unificado de Órdenes de compra y servicio — UX únicamente. Junta
 * `compras.ordenes_compra` y `servicios.ordenes_servicio` con dos consultas
 * separadas (Bounded Contexts distintos, PostgREST no las embebe en una
 * sola query cross-schema — ver CLAUDE.md) y normaliza en JS. Cada fila
 * sigue apuntando al detalle real de su propio contexto
 * (/ordenes-compra/[id] o /servicios/[id]) — no hay una tabla ni un modelo
 * nuevo "orden unificada", solo esta capa de lectura.
 */

export type FilaOrdenUnificada = {
  id: string
  tipo: TipoOrdenUnificada
  codigo: string
  fecha: string
  proveedor: string
  ruc: string | null
  resumen: string
  total: number
  moneda: string
  estado: string
  estadoEtiqueta: string
  siguientePaso: string
  href: string
}

export type FiltrosOrdenes = {
  busqueda?: string
  tipo?: TipoOrdenUnificada
  estado?: string
  proveedorId?: string
  fechaDesde?: string
  fechaHasta?: string
  soloPendientes?: boolean
}

const TAMANO_PAGINA = 25
// Techo defensivo por tabla — a este volumen (cientos de filas hoy) alcanza
// de sobra; si el módulo crece mucho más, esto se resuelve moviendo el
// filtro/búsqueda a SQL en vez de acá. Ver conversación de diseño del
// módulo de Reportes (mismo criterio, mismo trade-off documentado).
const TECHO_POR_TABLA = 500

function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

export async function obtenerOrdenesUnificadas(
  filtros: FiltrosOrdenes,
  pagina: number
): Promise<{ filas: FilaOrdenUnificada[]; total: number; totalPaginas: number }> {
  const supabase = crearClienteServidor()

  const [ocsResp, ossResp] = await Promise.all([
    filtros.tipo === 'servicio'
      ? Promise.resolve({ data: [] as any[] })
      : supabase
          .schema('compras')
          .from('ordenes_compra')
          .select(
            `id, codigo, tipo, estado, fecha_emision, moneda, proveedor_id,
             ordenes_compra_items(cantidad_pedida, precio_unitario)`
          )
          .order('created_at', { ascending: false })
          .limit(TECHO_POR_TABLA),
    filtros.tipo === 'mercaderia' || filtros.tipo === 'bien'
      ? Promise.resolve({ data: [] as any[] })
      : supabase
          .schema('servicios')
          .from('ordenes_servicio')
          .select('id, codigo, estado, descripcion_servicio, monto_estimado, moneda, proveedor_servicio_id, fecha_solicitud')
          .order('created_at', { ascending: false })
          .limit(TECHO_POR_TABLA),
  ])

  const ocs = ocsResp.data ?? []
  const oss = ossResp.data ?? []

  const [proveedores, proveedoresServicio] = await Promise.all([
    mapaProveedores([...new Set(ocs.map((o: any) => o.proveedor_id))]),
    mapaProveedoresServicio([...new Set(oss.map((o: any) => o.proveedor_servicio_id))]),
  ])

  const filasOC: FilaOrdenUnificada[] = ocs.map((o: any) => {
    const items = (o.ordenes_compra_items ?? []) as { cantidad_pedida: number; precio_unitario: number }[]
    const total = items.reduce((acc, i) => acc + Number(i.cantidad_pedida) * Number(i.precio_unitario), 0)
    const prov = proveedores.get(o.proveedor_id)
    return {
      id: o.id,
      tipo: o.tipo as TipoOrdenUnificada,
      codigo: o.codigo,
      fecha: o.fecha_emision,
      proveedor: prov?.razon_social ?? 'proveedor no legible',
      ruc: prov?.ruc ?? null,
      resumen: `${items.length} línea(s)`,
      total: Math.round(total * 100) / 100,
      moneda: o.moneda,
      estado: o.estado,
      estadoEtiqueta: etiquetaEstado(o.tipo as TipoOrdenUnificada, o.estado),
      siguientePaso: siguientePasoOC(o.estado as EstadoOC),
      href: `/ordenes-compra/${o.id}`,
    }
  })

  const filasOS: FilaOrdenUnificada[] = oss.map((o: any) => {
    const prov = proveedoresServicio.get(o.proveedor_servicio_id)
    return {
      id: o.id,
      tipo: 'servicio',
      codigo: o.codigo,
      fecha: o.fecha_solicitud,
      proveedor: prov?.razon_social ?? 'proveedor no legible',
      ruc: prov?.ruc ?? null,
      resumen: o.descripcion_servicio,
      total: Number(o.monto_estimado),
      moneda: o.moneda,
      estado: o.estado,
      estadoEtiqueta: etiquetaEstado('servicio', o.estado),
      siguientePaso: siguientePasoOS(o.estado as EstadoOS),
      href: `/servicios/${o.id}`,
    }
  })

  let filas = [...filasOC, ...filasOS]

  if (filtros.busqueda?.trim()) {
    const q = normalizar(filtros.busqueda)
    filas = filas.filter(
      (f) => normalizar(f.codigo).includes(q) || normalizar(f.proveedor).includes(q) || (f.ruc ? normalizar(f.ruc).includes(q) : false)
    )
  }
  if (filtros.estado) filas = filas.filter((f) => f.estado === filtros.estado)
  if (filtros.proveedorId) {
    // proveedorId puede ser de compras.proveedores o de servicios.proveedores_servicio —
    // se resuelve comparando contra los ids ya usados para armar los mapas de arriba.
    const prov = proveedores.get(filtros.proveedorId) ?? proveedoresServicio.get(filtros.proveedorId)
    if (prov) filas = filas.filter((f) => f.proveedor === prov.razon_social)
  }
  if (filtros.fechaDesde) filas = filas.filter((f) => f.fecha >= filtros.fechaDesde!)
  if (filtros.fechaHasta) filas = filas.filter((f) => f.fecha <= filtros.fechaHasta!)
  if (filtros.soloPendientes) filas = filas.filter((f) => ordenPendiente(f.estado as EstadoOC | EstadoOS))

  filas.sort((a, b) => (b.fecha ?? '').localeCompare(a.fecha ?? '') || b.codigo.localeCompare(a.codigo))

  const total = filas.length
  const totalPaginas = Math.max(1, Math.ceil(total / TAMANO_PAGINA))
  const desde = (pagina - 1) * TAMANO_PAGINA
  const filasPagina = filas.slice(desde, desde + TAMANO_PAGINA)

  return { filas: filasPagina, total, totalPaginas }
}

async function mapaProveedores(ids: string[]) {
  const supabase = crearClienteServidor()
  if (ids.length === 0) return new Map<string, { razon_social: string; ruc: string }>()
  const { data } = await supabase.schema('compras').from('proveedores').select('id, razon_social, ruc').in('id', ids)
  return new Map((data ?? []).map((p: any) => [p.id, { razon_social: p.razon_social, ruc: p.ruc }]))
}

async function mapaProveedoresServicio(ids: string[]) {
  const supabase = crearClienteServidor()
  if (ids.length === 0) return new Map<string, { razon_social: string; ruc: string }>()
  const { data } = await supabase.schema('servicios').from('proveedores_servicio').select('id, razon_social, ruc').in('id', ids)
  return new Map((data ?? []).map((p: any) => [p.id, { razon_social: p.razon_social, ruc: p.ruc }]))
}

export type ProveedorParaFiltro = { id: string; nombre: string }

/** Lista combinada de proveedores (mercadería/bien + servicio) para el filtro del visor. */
export async function listarProveedoresParaFiltro(): Promise<ProveedorParaFiltro[]> {
  const supabase = crearClienteServidor()
  const [{ data: p1 }, { data: p2 }] = await Promise.all([
    supabase.schema('compras').from('proveedores').select('id, razon_social').order('razon_social'),
    supabase.schema('servicios').from('proveedores_servicio').select('id, razon_social').order('razon_social'),
  ])
  const combinados = [
    ...(p1 ?? []).map((p: any) => ({ id: p.id, nombre: p.razon_social })),
    ...(p2 ?? []).map((p: any) => ({ id: p.id, nombre: p.razon_social })),
  ]
  return combinados.sort((a, b) => a.nombre.localeCompare(b.nombre))
}
