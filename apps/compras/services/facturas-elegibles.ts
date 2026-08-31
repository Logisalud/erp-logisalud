import 'server-only'
import { crearClienteServidor } from '@logisalud/auth/server'
import { recepcionEsFacturable, osEsFacturable, saldoDisponibleLinea } from '@/domain/facturas-elegibles'

/**
 * Búsqueda de "¿qué orden puedo facturar ahora?" — el paso 1 real de
 * /facturas/nueva. No crea ningún flujo paralelo de registro: cada fila
 * apunta al mecanismo que YA existe y YA es correcto para su tipo —
 *   - compra: la recepción conforme sin obligación → /cuentas-por-pagar/nueva/[recepcionId]
 *     (services/obligaciones.ts::registrarObligacionDesdeRecepcion, con su
 *     conciliación de 3 vías real).
 *   - servicio: la OS aprobada/en ejecución sin factura subida todavía →
 *     /servicios/[id] (el mismo formulario de factura que ya usa esa ficha).
 * Esta función solo decide QUÉ es elegible y muestra saldo disponible —
 * el saldo sale de `cantidad_facturada` (compra) o de si ya hay archivo
 * subido (servicio), columnas que ya existen, nada inventado.
 */

export type FilaFacturable = {
  tipo: 'compra' | 'servicio'
  id: string
  ordenCodigo: string
  fecha: string
  proveedor: string
  ruc: string | null
  resumen: string
  moneda: string
  totalOrden: number
  montoFacturado: number
  saldoDisponible: number
  estado: string
  hrefRegistro: string
}

export type FiltrosFacturables = { busqueda?: string; tipo?: 'compra' | 'servicio' }

function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

export async function buscarOrdenesFacturables(filtros: FiltrosFacturables): Promise<FilaFacturable[]> {
  const [compras, servicios] = await Promise.all([
    filtros.tipo === 'servicio' ? Promise.resolve([]) : buscarRecepcionesFacturables(),
    filtros.tipo === 'compra' ? Promise.resolve([]) : buscarOSFacturables(),
  ])

  let filas = [...compras, ...servicios]
  if (filtros.busqueda?.trim()) {
    const q = normalizar(filtros.busqueda)
    filas = filas.filter(
      (f) => normalizar(f.ordenCodigo).includes(q) || normalizar(f.proveedor).includes(q) || (f.ruc ? normalizar(f.ruc).includes(q) : false)
    )
  }
  return filas.sort((a, b) => (b.fecha ?? '').localeCompare(a.fecha ?? ''))
}

async function buscarRecepcionesFacturables(): Promise<FilaFacturable[]> {
  const supabase = crearClienteServidor()

  const { data: recepciones, error } = await supabase
    .schema('almacen')
    .from('recepciones')
    .select('id, oc_id, fecha_conformidad, estado')
    .eq('estado', 'conforme')
    .order('fecha_conformidad', { ascending: false })
    .limit(200)
  if (error) throw new Error(`No se pudieron buscar recepciones: ${error.message}`)
  const recepcionesConforme = recepciones ?? []
  if (recepcionesConforme.length === 0) return []

  const { data: obligacionesExistentes } = await supabase
    .schema('cuentas_x_pagar')
    .from('obligaciones')
    .select('recepcion_id')
    .in('recepcion_id', recepcionesConforme.map((r) => r.id))
  const recepcionesConObligacion = new Set((obligacionesExistentes ?? []).map((o: any) => o.recepcion_id))

  const elegibles = recepcionesConforme.filter((r) => recepcionEsFacturable(r.estado, recepcionesConObligacion.has(r.id)))
  if (elegibles.length === 0) return []

  const ocIds = [...new Set(elegibles.map((r) => r.oc_id))]
  const { data: ocs } = await supabase
    .schema('compras')
    .from('ordenes_compra')
    .select('id, codigo, moneda, proveedor_id, ordenes_compra_items(cantidad_pedida, cantidad_facturada, precio_unitario)')
    .in('id', ocIds)
  const proveedores = await mapaProveedores([...new Set((ocs ?? []).map((o: any) => o.proveedor_id))])
  const ocsPorId = new Map((ocs ?? []).map((o: any) => [o.id, o]))

  return elegibles
    .map((r): FilaFacturable | null => {
      const oc = ocsPorId.get(r.oc_id)
      if (!oc) return null
      const items = (oc.ordenes_compra_items ?? []) as { cantidad_pedida: number; cantidad_facturada: number; precio_unitario: number }[]
      const totalOrden = redondear(items.reduce((acc, i) => acc + Number(i.cantidad_pedida) * Number(i.precio_unitario), 0))
      const montoFacturado = redondear(items.reduce((acc, i) => acc + Number(i.cantidad_facturada) * Number(i.precio_unitario), 0))
      const prov = proveedores.get(oc.proveedor_id)
      return {
        tipo: 'compra',
        id: r.id,
        ordenCodigo: oc.codigo,
        fecha: r.fecha_conformidad ?? '',
        proveedor: prov?.razon_social ?? 'proveedor no legible',
        ruc: prov?.ruc ?? null,
        resumen: `${items.length} línea(s) recibida(s)`,
        moneda: oc.moneda,
        totalOrden,
        montoFacturado,
        saldoDisponible: saldoDisponibleLinea(totalOrden, montoFacturado),
        estado: 'Recepción conforme — sin facturar',
        hrefRegistro: `/cuentas-por-pagar/nueva/${r.id}`,
      }
    })
    .filter((f): f is FilaFacturable => f !== null)
}

async function buscarOSFacturables(): Promise<FilaFacturable[]> {
  const supabase = crearClienteServidor()
  const { data: oss, error } = await supabase
    .schema('servicios')
    .from('ordenes_servicio')
    .select('id, codigo, descripcion_servicio, monto_estimado, moneda, proveedor_servicio_id, fecha_solicitud, estado, storage_path_factura_proveedor')
    .in('estado', ['aprobada', 'en_ejecucion'])
    .order('fecha_solicitud', { ascending: false })
    .limit(200)
  if (error) throw new Error(`No se pudieron buscar órdenes de servicio: ${error.message}`)
  const elegibles = (oss ?? []).filter((o) => osEsFacturable(o.estado, !!o.storage_path_factura_proveedor))
  if (elegibles.length === 0) return []

  const proveedores = await mapaProveedoresServicio([...new Set(elegibles.map((o: any) => o.proveedor_servicio_id))])

  return elegibles.map((o: any) => {
    const prov = proveedores.get(o.proveedor_servicio_id)
    return {
      tipo: 'servicio' as const,
      id: o.id,
      ordenCodigo: o.codigo,
      fecha: o.fecha_solicitud,
      proveedor: prov?.razon_social ?? 'proveedor no legible',
      ruc: prov?.ruc ?? null,
      resumen: o.descripcion_servicio,
      moneda: o.moneda,
      totalOrden: Number(o.monto_estimado),
      montoFacturado: 0,
      saldoDisponible: Number(o.monto_estimado),
      estado: 'Aprobada — sin factura',
      hrefRegistro: `/servicios/${o.id}`,
    }
  })
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

function redondear(n: number): number {
  return Number(`${Math.round(Number(`${n}e2`))}e-2`)
}
