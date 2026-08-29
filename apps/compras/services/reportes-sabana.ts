import 'server-only'
import { crearClienteServidor } from '@logisalud/auth/server'
import { diasVencido, estadoPagoSabana, saldoPendiente, ETIQUETA_ORIGEN, type OrigenObligacion } from '@/domain/reportes'
import type { EstadoObligacion } from '@/domain/obligacion'

/**
 * Sábana maestra — una fila plana por obligación, todos los campos
 * denormalizados, para bajar a Excel y analizar libre (filtrar/agrupar por
 * proveedor como columna, nunca como tabla aparte).
 *
 * "N° de referencia" depende del origen: la mayoría de los orígenes ya tiene
 * una FK directa en `obligaciones` (oc_id, os_id, solicitud_gasto_id,
 * reposicion_caja_chica_id) o el texto ya quedó escrito en `observaciones`
 * al generar la obligación (prestamo/fraccionamiento_sunat/impuesto — ver
 * services/financiamiento.ts e services/impuestos.ts). Solo
 * `letra_por_pagar` necesita un reverse-lookup real, porque
 * `financiamiento.letras_por_pagar` es quien apunta a la obligación y no al
 * revés.
 */

export type FiltrosSabana = {
  origen?: OrigenObligacion
  proveedorId?: string
  fechaDesde?: string
  fechaHasta?: string
}

export type FilaSabana = {
  id: string
  codigo: string
  quien: string
  ruc: string | null
  origen: OrigenObligacion
  origenEtiqueta: string
  referencia: string | null
  numeroFactura: string | null
  fechaEmision: string | null
  fechaVencimiento: string | null
  diasVencido: number | null
  moneda: string
  montoOriginal: number
  montoPagado: number
  saldoPendiente: number
  estado: 'pendiente' | 'parcial' | 'pagado'
  area: string | null
  responsable: string | null
  fechaPago: string | null
  formaPago: string | null
}

type ObligacionCruda = {
  id: string
  codigo: string
  origen: OrigenObligacion
  proveedor_id: string | null
  beneficiario_persona: string | null
  oc_id: string | null
  os_id: string | null
  solicitud_gasto_id: string | null
  reposicion_caja_chica_id: string | null
  numero_factura: string | null
  fecha_factura: string | null
  moneda: string
  neto_a_pagar: number
  estado: EstadoObligacion
  fecha_vencimiento_real: string | null
  observaciones: string | null
  created_by: string | null
  created_at: string
}

export async function obtenerSabanaMaestra(filtros: FiltrosSabana): Promise<FilaSabana[]> {
  const supabase = crearClienteServidor()
  const hoy = new Date().toISOString().slice(0, 10)

  let q = supabase
    .schema('cuentas_x_pagar')
    .from('obligaciones')
    .select(
      `id, codigo, origen, proveedor_id, beneficiario_persona, oc_id, os_id, solicitud_gasto_id,
       reposicion_caja_chica_id, numero_factura, fecha_factura, moneda, neto_a_pagar, estado,
       fecha_vencimiento_real, observaciones, created_by, created_at`
    )
    .order('created_at', { ascending: false })
    .limit(2000)
  if (filtros.origen) q = q.eq('origen', filtros.origen)
  if (filtros.proveedorId) q = q.eq('proveedor_id', filtros.proveedorId)
  if (filtros.fechaDesde) q = q.gte('created_at', filtros.fechaDesde)
  if (filtros.fechaHasta) q = q.lte('created_at', filtros.fechaHasta)

  const { data, error } = await q
  if (error) throw new Error(`No se pudo armar la sábana maestra: ${error.message}`)
  const filas = (data ?? []) as ObligacionCruda[]
  if (filas.length === 0) return []

  const [proveedores, beneficiarios, ocs, oss, solicitudes, reposiciones, letras, pagados, responsables, pagos] =
    await Promise.all([
      mapaProveedores([...new Set(filas.map((f) => f.proveedor_id).filter(esId))]),
      mapaBeneficiarios([...new Set(filas.map((f) => f.beneficiario_persona).filter(esId))]),
      mapaCodigos('compras', 'ordenes_compra', [...new Set(filas.map((f) => f.oc_id).filter(esId))]),
      mapaCodigos('servicios', 'ordenes_servicio', [...new Set(filas.map((f) => f.os_id).filter(esId))]),
      mapaCodigos('gastos', 'solicitudes_gasto', [...new Set(filas.map((f) => f.solicitud_gasto_id).filter(esId))]),
      mapaCodigos('caja_chica', 'reposiciones', [...new Set(filas.map((f) => f.reposicion_caja_chica_id).filter(esId))]),
      mapaLetras(filas.filter((f) => f.origen === 'letra_por_pagar').map((f) => f.id)),
      mapaMontosPagados(filas.map((f) => f.id)),
      mapaResponsables([...new Set(filas.map((f) => f.created_by).filter(esId))]),
      mapaUltimoPagoAplicado(filas.map((f) => f.id)),
    ])

  return filas.map((f) => {
    const montoPagado = pagados.get(f.id) ?? 0
    const responsable = f.created_by ? responsables.get(f.created_by) ?? null : null
    const pago = pagos.get(f.id)
    return {
      id: f.id,
      codigo: f.codigo,
      quien:
        (f.proveedor_id ? proveedores.get(f.proveedor_id)?.razon_social : undefined) ??
        (f.beneficiario_persona ? beneficiarios.get(f.beneficiario_persona) : undefined) ??
        f.observaciones ??
        ETIQUETA_ORIGEN[f.origen],
      ruc: f.proveedor_id ? proveedores.get(f.proveedor_id)?.ruc ?? null : null,
      origen: f.origen,
      origenEtiqueta: ETIQUETA_ORIGEN[f.origen],
      referencia: referenciaDe(f, { ocs, oss, solicitudes, reposiciones, letras }),
      numeroFactura: f.numero_factura,
      fechaEmision: f.fecha_factura ?? f.created_at.slice(0, 10),
      fechaVencimiento: f.fecha_vencimiento_real,
      diasVencido: diasVencido(f.fecha_vencimiento_real, hoy),
      moneda: f.moneda,
      montoOriginal: Number(f.neto_a_pagar),
      montoPagado,
      saldoPendiente: saldoPendiente(Number(f.neto_a_pagar), montoPagado),
      estado: estadoPagoSabana(Number(f.neto_a_pagar), montoPagado),
      area: responsable?.area ?? null,
      responsable: responsable?.nombre ?? null,
      fechaPago: pago?.fecha_pago ?? null,
      formaPago: pago ? 'Transferencia bancaria' : null,
    }
  })
}

function esId(v: string | null): v is string {
  return !!v
}

function referenciaDe(
  f: ObligacionCruda,
  mapas: {
    ocs: Map<string, string>
    oss: Map<string, string>
    solicitudes: Map<string, string>
    reposiciones: Map<string, string>
    letras: Map<string, string>
  }
): string | null {
  switch (f.origen) {
    case 'compra':
      return f.oc_id ? mapas.ocs.get(f.oc_id) ?? null : null
    case 'servicio':
      return f.os_id ? mapas.oss.get(f.os_id) ?? null : null
    case 'reembolso':
    case 'anticipo':
      return f.solicitud_gasto_id ? mapas.solicitudes.get(f.solicitud_gasto_id) ?? null : null
    case 'reposicion_caja_chica':
      return f.reposicion_caja_chica_id ? mapas.reposiciones.get(f.reposicion_caja_chica_id) ?? null : null
    case 'letra_por_pagar':
      return mapas.letras.get(f.id) ?? null
    // gasto_directo (pago directo) no tiene un documento de referencia previo
    // — la factura que se transcribe ES el origen. prestamo/fraccionamiento_
    // sunat/impuesto ya traen su referencia en `observaciones`.
    case 'gasto_directo':
      return null
    default:
      return f.observaciones
  }
}

async function mapaProveedores(ids: string[]) {
  const supabase = crearClienteServidor()
  if (ids.length === 0) return new Map<string, { razon_social: string; ruc: string }>()
  const { data } = await supabase.schema('compras').from('proveedores').select('id, razon_social, ruc').in('id', ids)
  return new Map((data ?? []).map((p: any) => [p.id, { razon_social: p.razon_social, ruc: p.ruc }]))
}

async function mapaBeneficiarios(ids: string[]) {
  const supabase = crearClienteServidor()
  if (ids.length === 0) return new Map<string, string>()
  const { data } = await supabase.from('perfiles').select('id, nombre').in('id', ids)
  return new Map((data ?? []).map((p: any) => [p.id, p.nombre as string]))
}

async function mapaResponsables(ids: string[]) {
  const supabase = crearClienteServidor()
  if (ids.length === 0) return new Map<string, { nombre: string; area: string }>()
  const { data } = await supabase.from('perfiles').select('id, nombre, area').in('id', ids)
  return new Map((data ?? []).map((p: any) => [p.id, { nombre: p.nombre, area: p.area }]))
}

/** Mapa genérico id → código, para las tablas de referencia forward-FK desde obligaciones. */
async function mapaCodigos(schema: string, tabla: string, ids: string[]) {
  const supabase = crearClienteServidor()
  if (ids.length === 0) return new Map<string, string>()
  const { data } = await supabase.schema(schema as any).from(tabla).select('id, codigo').in('id', ids)
  return new Map((data ?? []).map((r: any) => [r.id, r.codigo as string]))
}

/** Único reverse-lookup real: letras_por_pagar apunta a la obligación, no al revés. */
async function mapaLetras(obligacionIds: string[]) {
  const supabase = crearClienteServidor()
  if (obligacionIds.length === 0) return new Map<string, string>()
  const { data } = await supabase
    .schema('financiamiento')
    .from('letras_por_pagar')
    .select('obligacion_id, numero_letra')
    .in('obligacion_id', obligacionIds)
  return new Map((data ?? []).map((l: any) => [l.obligacion_id, l.numero_letra ?? 'Letra sin número']))
}

async function mapaMontosPagados(obligacionIds: string[]) {
  const supabase = crearClienteServidor()
  const resultado = new Map<string, number>()
  if (obligacionIds.length === 0) return resultado
  const { data } = await supabase
    .schema('cuentas_x_pagar')
    .from('pago_aplicacion')
    .select('obligacion_id, monto_aplicado')
    .in('obligacion_id', obligacionIds)
  for (const a of (data ?? []) as any[]) {
    resultado.set(a.obligacion_id, (resultado.get(a.obligacion_id) ?? 0) + Number(a.monto_aplicado))
  }
  return resultado
}

/** Fecha del pago aplicado a cada obligación — si hubo más de un pago parcial, la última fecha. */
async function mapaUltimoPagoAplicado(obligacionIds: string[]) {
  const supabase = crearClienteServidor()
  const resultado = new Map<string, { fecha_pago: string | null }>()
  if (obligacionIds.length === 0) return resultado
  const { data: aplicaciones } = await supabase
    .schema('cuentas_x_pagar')
    .from('pago_aplicacion')
    .select('obligacion_id, pago_id')
    .in('obligacion_id', obligacionIds)
  const pagoIds = [...new Set((aplicaciones ?? []).map((a: any) => a.pago_id))]
  if (pagoIds.length === 0) return resultado
  const { data: pagos } = await supabase.schema('cuentas_x_pagar').from('pagos').select('id, fecha_pago').in('id', pagoIds)
  const fechaPorPago = new Map((pagos ?? []).map((p: any) => [p.id, p.fecha_pago]))
  for (const a of (aplicaciones ?? []) as any[]) {
    const fecha = fechaPorPago.get(a.pago_id) ?? null
    const actual = resultado.get(a.obligacion_id)
    if (!actual || (fecha ?? '') > (actual.fecha_pago ?? '')) resultado.set(a.obligacion_id, { fecha_pago: fecha })
  }
  return resultado
}
