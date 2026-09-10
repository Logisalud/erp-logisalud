import 'server-only'
import { crearClienteServidor, exigirUsuario } from '@logisalud/auth/server'
import { calcularTotales } from '@/domain/orden-compra'
import type { EstadoOC } from '@/domain/orden-compra'
import type { EstadoOS } from '@/domain/servicio'
import type { EstadoObligacion } from '@/domain/obligacion'
import type { EstadoSolicitud } from '@/domain/gasto'
import {
  estadoDeOC, estadoDeOS, estadoDePagoDirecto, estadoDeSolicitud,
  estadoPagoDeObligaciones, ordenarPorFechaDesc,
  proximoPasoDeOC, proximoPasoDeOS, proximoPasoDePagoDirecto, proximoPasoDeSolicitud,
  voucherDeOperacion,
  type FilaOperacion, type PagoDeOperacion,
} from '@/domain/mis-operaciones'

/**
 * "Mis operaciones": todo lo que creó la persona que está mirando, de las
 * cuatro tablas donde puede nacer algo suyo.
 *
 * Cuatro consultas en paralelo y merge en JS, NO una vista SQL: es el mismo
 * patrón que ya usa services/reportes-sabana.ts, y es el único que funciona
 * acá — PostgREST no cruza schemas en un solo `.select()` (ver CLAUDE.md), y
 * la normalización de estados es lógica de dominio testeada en
 * domain/mis-operaciones.ts, no CASE en SQL duplicando lo mismo.
 *
 * El volumen es naturalmente chico (lo de UNA persona), así que no hay
 * paginación: se traen las cuatro listas completas y se ordenan juntas.
 */
export async function listarMisOperaciones(): Promise<FilaOperacion[]> {
  const usuario = await exigirUsuario()
  const supabase = crearClienteServidor()

  const [ocs, oss, pagosDirectos, solicitudes] = await Promise.all([
    supabase
      .schema('compras')
      .from('ordenes_compra')
      .select('id, codigo, tipo, estado, moneda, created_at, anulado_motivo, proveedor_id, ordenes_compra_items(cantidad_pedida, precio_unitario)')
      .eq('creado_por', usuario.id)
      .order('created_at', { ascending: false }),
    supabase
      .schema('servicios')
      .from('ordenes_servicio')
      .select('id, codigo, estado, moneda, monto_estimado, created_at, anulado_motivo, proveedor_servicio_id')
      .eq('solicitante_id', usuario.id)
      .order('created_at', { ascending: false }),
    supabase
      .schema('cuentas_x_pagar')
      .from('obligaciones')
      .select('id, codigo, estado, moneda, total, created_at, anulada_motivo, rechazo_motivo, categoria_pago_directo_id')
      .eq('origen', 'gasto_directo')
      .eq('created_by', usuario.id)
      .order('created_at', { ascending: false }),
    supabase
      .schema('gastos')
      .from('solicitudes_gasto')
      .select('id, codigo, tipo, estado, moneda, monto_solicitado, descripcion, created_at, rechazo_motivo, categoria_id, obligacion_id')
      .eq('solicitante_id', usuario.id)
      .in('tipo', ['anticipo', 'reembolso'])
      .order('created_at', { ascending: false }),
  ])

  const filasOC = (ocs.data ?? []) as any[]
  const filasOS = (oss.data ?? []) as any[]
  const filasPD = (pagosDirectos.data ?? []) as any[]
  const filasSol = (solicitudes.data ?? []) as any[]

  // Las obligaciones que le corresponden a cada fila — de ahí sale "¿Pagado?"
  // y el voucher. Cada tipo llega a su obligación por un camino distinto:
  // la OC y la OS por `oc_id`/`os_id`, la solicitud por su `obligacion_id`,
  // y un Pago Directo ES la obligación.
  const [obligacionesPorOC, obligacionPorOS] = await Promise.all([
    obligacionesPorColumna('oc_id', filasOC.map((o) => o.id)),
    obligacionesPorColumna('os_id', filasOS.map((o) => o.id)),
  ])
  const obligacionesDeSolicitudes = await obligacionesPorId(
    filasSol.map((s) => s.obligacion_id).filter((id: string | null): id is string => !!id)
  )

  const idsObligacion = [
    ...[...obligacionesPorOC.values()].flat().map((o) => o.id),
    ...[...obligacionPorOS.values()].flat().map((o) => o.id),
    ...filasPD.map((o) => o.id),
    ...[...obligacionesDeSolicitudes.values()].map((o) => o.id),
  ]

  const [pagosPorObligacion, proveedores, proveedoresServicio, categoriasPD, categoriasGasto] = await Promise.all([
    mapaPagos(idsObligacion),
    mapaNombres('compras', 'proveedores', filasOC.map((o) => o.proveedor_id)),
    mapaNombres('servicios', 'proveedores_servicio', filasOS.map((o) => o.proveedor_servicio_id)),
    mapaNombres('cuentas_x_pagar', 'categorias_pago_directo', filasPD.map((o) => o.categoria_pago_directo_id), 'nombre'),
    mapaNombres('gastos', 'categorias_gasto', filasSol.map((s) => s.categoria_id), 'nombre'),
  ])

  /** Junta los pagos de un conjunto de obligaciones, sin repetir. */
  const pagosDe = (ids: string[]): PagoDeOperacion[] =>
    ids.flatMap((id) => pagosPorObligacion.get(id) ?? [])

  const operacionesOC: FilaOperacion[] = filasOC.map((oc) => {
    const obligaciones = obligacionesPorOC.get(oc.id) ?? []
    const totales = calcularTotales(
      (oc.ordenes_compra_items ?? []).map((i: any) => ({
        cantidadPedida: Number(i.cantidad_pedida),
        precioUnitario: Number(i.precio_unitario),
      }))
    )
    const href = `/ordenes-compra/${oc.id}`
    const estado = estadoDeOC(oc.estado as EstadoOC)
    return {
      id: oc.id,
      tipo: oc.tipo === 'bien' ? 'oc_bien' : 'oc_mercaderia',
      codigo: oc.codigo,
      fechaCreacion: oc.created_at,
      referencia: proveedores.get(oc.proveedor_id) ?? null,
      monto: totales.total,
      moneda: oc.moneda,
      estadoTexto: estado.texto,
      estadoTono: estado.tono,
      motivoCorte: oc.anulado_motivo ?? null,
      proximoPaso: proximoPasoDeOC(oc.estado as EstadoOC),
      pagado: estadoPagoDeObligaciones(obligaciones.map((o) => o.estado)),
      voucher: voucherDeOperacion(pagosDe(obligaciones.map((o) => o.id)), href),
      href,
    }
  })

  const operacionesOS: FilaOperacion[] = filasOS.map((os) => {
    const obligaciones = obligacionPorOS.get(os.id) ?? []
    const href = `/servicios/${os.id}`
    const estado = estadoDeOS(os.estado as EstadoOS)
    return {
      id: os.id,
      tipo: 'os',
      codigo: os.codigo,
      fechaCreacion: os.created_at,
      referencia: proveedoresServicio.get(os.proveedor_servicio_id) ?? null,
      monto: Number(os.monto_estimado),
      moneda: os.moneda,
      estadoTexto: estado.texto,
      estadoTono: estado.tono,
      motivoCorte: os.anulado_motivo ?? null,
      proximoPaso: proximoPasoDeOS(os.estado as EstadoOS),
      pagado: estadoPagoDeObligaciones(obligaciones.map((o) => o.estado)),
      voucher: voucherDeOperacion(pagosDe(obligaciones.map((o) => o.id)), href),
      href,
    }
  })

  const operacionesPD: FilaOperacion[] = filasPD.map((pd) => {
    const href = `/cuentas-por-pagar/${pd.id}`
    const estado = estadoDePagoDirecto(pd.estado as EstadoObligacion)
    return {
      id: pd.id,
      tipo: 'pago_directo',
      codigo: pd.codigo,
      fechaCreacion: pd.created_at,
      referencia: categoriasPD.get(pd.categoria_pago_directo_id) ?? null,
      monto: Number(pd.total),
      moneda: pd.moneda,
      estadoTexto: estado.texto,
      estadoTono: estado.tono,
      motivoCorte: pd.rechazo_motivo ?? pd.anulada_motivo ?? null,
      proximoPaso: proximoPasoDePagoDirecto(pd.estado as EstadoObligacion),
      pagado: estadoPagoDeObligaciones([pd.estado as EstadoObligacion]),
      voucher: voucherDeOperacion(pagosDe([pd.id]), href),
      href,
    }
  })

  const operacionesSol: FilaOperacion[] = filasSol.map((sol) => {
    const obligacion = sol.obligacion_id ? obligacionesDeSolicitudes.get(sol.obligacion_id) : null
    const href = `/gastos/${sol.id}`
    const estado = estadoDeSolicitud(sol.estado as EstadoSolicitud)
    return {
      id: sol.id,
      tipo: sol.tipo === 'anticipo' ? 'anticipo' : 'reembolso',
      codigo: sol.codigo,
      fechaCreacion: sol.created_at,
      referencia: categoriasGasto.get(sol.categoria_id) ?? sol.descripcion ?? null,
      monto: Number(sol.monto_solicitado),
      moneda: sol.moneda,
      estadoTexto: estado.texto,
      estadoTono: estado.tono,
      motivoCorte: sol.rechazo_motivo ?? null,
      proximoPaso: proximoPasoDeSolicitud(sol.estado as EstadoSolicitud),
      pagado: estadoPagoDeObligaciones(obligacion ? [obligacion.estado] : []),
      voucher: voucherDeOperacion(obligacion ? pagosDe([obligacion.id]) : [], href),
      href,
    }
  })

  return ordenarPorFechaDesc([...operacionesOC, ...operacionesOS, ...operacionesPD, ...operacionesSol])
}

/** Obligaciones agrupadas por la OC/OS que las originó — una OC puede tener varias (facturas parciales). */
async function obligacionesPorColumna(
  columna: 'oc_id' | 'os_id',
  ids: string[]
): Promise<Map<string, { id: string; estado: EstadoObligacion }[]>> {
  const mapa = new Map<string, { id: string; estado: EstadoObligacion }[]>()
  if (ids.length === 0) return mapa
  const supabase = crearClienteServidor()
  const { data } = await supabase
    .schema('cuentas_x_pagar')
    .from('obligaciones')
    .select(`id, estado, ${columna}`)
    .in(columna, ids)
  for (const fila of (data ?? []) as any[]) {
    const clave = fila[columna] as string
    const previas = mapa.get(clave) ?? []
    previas.push({ id: fila.id, estado: fila.estado })
    mapa.set(clave, previas)
  }
  return mapa
}

async function obligacionesPorId(ids: string[]): Promise<Map<string, { id: string; estado: EstadoObligacion }>> {
  const mapa = new Map<string, { id: string; estado: EstadoObligacion }>()
  if (ids.length === 0) return mapa
  const supabase = crearClienteServidor()
  const { data } = await supabase.schema('cuentas_x_pagar').from('obligaciones').select('id, estado').in('id', ids)
  for (const fila of (data ?? []) as any[]) mapa.set(fila.id, { id: fila.id, estado: fila.estado })
  return mapa
}

/**
 * Los pagos ya aplicados a cada obligación. El voucher vive en
 * `cuentas_x_pagar.pagos` y se enlaza por `pago_aplicacion`, así que hacen
 * falta dos consultas — mismo camino que usa la ficha de la obligación.
 */
async function mapaPagos(obligacionIds: string[]): Promise<Map<string, PagoDeOperacion[]>> {
  const mapa = new Map<string, PagoDeOperacion[]>()
  const ids = [...new Set(obligacionIds)]
  if (ids.length === 0) return mapa
  const supabase = crearClienteServidor()

  const { data: aplicaciones } = await supabase
    .schema('cuentas_x_pagar')
    .from('pago_aplicacion')
    .select('pago_id, obligacion_id')
    .in('obligacion_id', ids)
  const filasAplicacion = (aplicaciones ?? []) as { pago_id: string; obligacion_id: string }[]
  if (filasAplicacion.length === 0) return mapa

  const { data: pagos } = await supabase
    .schema('cuentas_x_pagar')
    .from('pagos')
    .select('id, storage_path_voucher')
    .in('id', [...new Set(filasAplicacion.map((a) => a.pago_id))])
  const pagoPorId = new Map((pagos ?? []).map((p: any) => [p.id, p.storage_path_voucher as string | null]))

  for (const aplicacion of filasAplicacion) {
    const previos = mapa.get(aplicacion.obligacion_id) ?? []
    previos.push({ storagePath: pagoPorId.get(aplicacion.pago_id) ?? null })
    mapa.set(aplicacion.obligacion_id, previos)
  }
  return mapa
}

/** Nombre legible de un catálogo cualquiera, resuelto en una segunda consulta (cross-schema). */
async function mapaNombres(
  schema: 'compras' | 'servicios' | 'cuentas_x_pagar' | 'gastos',
  tabla: string,
  ids: (string | null)[],
  columna: 'razon_social' | 'nombre' = 'razon_social'
): Promise<Map<string, string>> {
  const mapa = new Map<string, string>()
  const limpios = [...new Set(ids.filter((id): id is string => !!id))]
  if (limpios.length === 0) return mapa
  const supabase = crearClienteServidor()
  const { data } = await supabase.schema(schema).from(tabla).select(`id, ${columna}`).in('id', limpios)
  for (const fila of (data ?? []) as any[]) mapa.set(fila.id, fila[columna])
  return mapa
}
