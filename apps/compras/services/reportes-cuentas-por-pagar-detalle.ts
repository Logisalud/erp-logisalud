import 'server-only'
import { crearClienteServidor } from '@logisalud/auth/server'
import {
  bucketAntiguedad,
  diasVencido,
  ETIQUETA_BUCKET,
  ESTADOS_OBLIGACION_ABIERTA,
  ETIQUETA_ORIGEN,
  type BucketAntiguedad,
  type OrigenObligacion,
} from '@/domain/reportes'
import type { EstadoObligacion } from '@/domain/obligacion'

/**
 * Los 4 reportes financieros de Cuentas por Pagar (Contabilidad/Tesorería) +
 * el reporte de detracciones, todos sobre `cuentas_x_pagar.obligaciones` —
 * hermano de reportes-cuentas-por-pagar.ts (que es el dashboard de "loops
 * abiertos" de la Fase 1.5, un propósito distinto: ese prioriza qué necesita
 * acción AHORA, estos son para leer/filtrar/exportar).
 */

export type QuienDebe = { proveedor: string | null; beneficiario: string | null; referencia: string | null }

async function mapaProveedores(ids: string[]) {
  const supabase = crearClienteServidor()
  if (ids.length === 0) return new Map<string, string>()
  const { data } = await supabase.schema('compras').from('proveedores').select('id, razon_social').in('id', ids)
  return new Map((data ?? []).map((p: any) => [p.id, p.razon_social as string]))
}

async function mapaBeneficiarios(ids: string[]) {
  const supabase = crearClienteServidor()
  if (ids.length === 0) return new Map<string, string>()
  const { data } = await supabase.from('perfiles').select('id, nombre').in('id', ids)
  return new Map((data ?? []).map((p: any) => [p.id, p.nombre as string]))
}

type ObligacionBase = {
  id: string
  codigo: string
  origen: OrigenObligacion
  numero_factura: string | null
  moneda: string
  neto_a_pagar: number
  estado: EstadoObligacion
  fecha_vencimiento_real: string | null
  observaciones: string | null
  proveedor_id: string | null
  beneficiario_persona: string | null
}

async function resolverQuienDebe(filas: readonly ObligacionBase[]): Promise<Map<string, QuienDebe>> {
  const [proveedores, beneficiarios] = await Promise.all([
    mapaProveedores([...new Set(filas.map((f) => f.proveedor_id).filter((x): x is string => !!x))]),
    mapaBeneficiarios([...new Set(filas.map((f) => f.beneficiario_persona).filter((x): x is string => !!x))]),
  ])
  const resultado = new Map<string, QuienDebe>()
  for (const f of filas) {
    resultado.set(f.id, {
      proveedor: f.proveedor_id ? proveedores.get(f.proveedor_id) ?? null : null,
      beneficiario: f.beneficiario_persona ? beneficiarios.get(f.beneficiario_persona) ?? null : null,
      // Para prestamo/fraccionamiento_sunat/impuesto la referencia ya queda
      // escrita en observaciones al generar la obligación (ver
      // services/financiamiento.ts e services/impuestos.ts) — no hay
      // proveedor ni beneficiario real a quién mostrar.
      referencia: f.observaciones,
    })
  }
  return resultado
}

const COLUMNAS_BASE =
  'id, codigo, origen, numero_factura, moneda, neto_a_pagar, estado, fecha_vencimiento_real, observaciones, proveedor_id, beneficiario_persona'

// ---------------------------------------------------------------------------
// 1. Antigüedad de saldos (AP Aging)
// ---------------------------------------------------------------------------

export type FilaAntiguedadProveedor = {
  clave: string
  nombre: string
  porBucket: Record<BucketAntiguedad, number>
  total: number
  moneda: string
}

export type ReporteAntiguedad = {
  filas: FilaAntiguedadProveedor[]
  /** Totales separados por moneda — nunca se mezcla PEN con USD en una suma. */
  totalesPorMoneda: { moneda: string; porBucket: Record<BucketAntiguedad, number>; total: number }[]
}

export async function obtenerAntiguedadSaldos(): Promise<ReporteAntiguedad> {
  const supabase = crearClienteServidor()
  const hoy = new Date().toISOString().slice(0, 10)

  const { data, error } = await supabase
    .schema('cuentas_x_pagar')
    .from('obligaciones')
    .select(COLUMNAS_BASE)
    .in('estado', ESTADOS_OBLIGACION_ABIERTA)
  if (error) throw new Error(`No se pudo armar la antigüedad de saldos: ${error.message}`)
  const filas = (data ?? []) as ObligacionBase[]

  const quienDebe = await resolverQuienDebe(filas)

  // Agrupa por moneda + "a quién se le debe" — mezclar PEN y USD en una fila
  // sumaría montos que no son comparables.
  const grupos = new Map<string, FilaAntiguedadProveedor>()
  const totalesPorMonedaMapa = new Map<string, Record<BucketAntiguedad, number>>()

  for (const f of filas) {
    const bucket = bucketAntiguedad(diasVencido(f.fecha_vencimiento_real, hoy))
    const quien = quienDebe.get(f.id)
    const nombre = quien?.proveedor ?? quien?.beneficiario ?? quien?.referencia ?? ETIQUETA_ORIGEN[f.origen]
    const clave = `${nombre}__${f.moneda}`
    const monto = Number(f.neto_a_pagar)

    if (!grupos.has(clave)) {
      grupos.set(clave, {
        clave,
        nombre,
        moneda: f.moneda,
        total: 0,
        porBucket: { por_vencer: 0, dias_1_30: 0, dias_31_60: 0, dias_61_90: 0, mas_90: 0 },
      })
    }
    const grupo = grupos.get(clave)!
    grupo.porBucket[bucket] += monto
    grupo.total += monto

    if (!totalesPorMonedaMapa.has(f.moneda)) {
      totalesPorMonedaMapa.set(f.moneda, { por_vencer: 0, dias_1_30: 0, dias_31_60: 0, dias_61_90: 0, mas_90: 0 })
    }
    totalesPorMonedaMapa.get(f.moneda)![bucket] += monto
  }

  return {
    filas: [...grupos.values()].sort((a, b) => b.total - a.total),
    totalesPorMoneda: [...totalesPorMonedaMapa.entries()].map(([moneda, porBucket]) => ({
      moneda,
      porBucket,
      total: Object.values(porBucket).reduce((a, b) => a + b, 0),
    })),
  }
}

// ---------------------------------------------------------------------------
// 2. Detalle de obligaciones abiertas
// ---------------------------------------------------------------------------

export type FiltrosAbiertas = { proveedorId?: string; bucket?: BucketAntiguedad; moneda?: string }

export type FilaObligacionAbierta = {
  id: string
  codigo: string
  origen: OrigenObligacion
  numeroFactura: string | null
  quien: string
  moneda: string
  netoAPagar: number
  estado: EstadoObligacion
  fechaVencimiento: string | null
  diasVencido: number | null
  bucket: BucketAntiguedad
}

export async function obtenerObligacionesAbiertas(filtros: FiltrosAbiertas): Promise<FilaObligacionAbierta[]> {
  const supabase = crearClienteServidor()
  const hoy = new Date().toISOString().slice(0, 10)

  let q = supabase
    .schema('cuentas_x_pagar')
    .from('obligaciones')
    .select(COLUMNAS_BASE)
    .in('estado', ESTADOS_OBLIGACION_ABIERTA)
    .order('fecha_vencimiento_real')
    .limit(500)
  if (filtros.proveedorId) q = q.eq('proveedor_id', filtros.proveedorId)
  if (filtros.moneda) q = q.eq('moneda', filtros.moneda)

  const { data, error } = await q
  if (error) throw new Error(`No se pudo listar las obligaciones abiertas: ${error.message}`)
  const filas = (data ?? []) as ObligacionBase[]
  const quienDebe = await resolverQuienDebe(filas)

  const resultado = filas.map((f) => {
    const dias = diasVencido(f.fecha_vencimiento_real, hoy)
    const quien = quienDebe.get(f.id)
    return {
      id: f.id,
      codigo: f.codigo,
      origen: f.origen,
      numeroFactura: f.numero_factura,
      quien: quien?.proveedor ?? quien?.beneficiario ?? quien?.referencia ?? ETIQUETA_ORIGEN[f.origen],
      moneda: f.moneda,
      netoAPagar: Number(f.neto_a_pagar),
      estado: f.estado,
      fechaVencimiento: f.fecha_vencimiento_real,
      diasVencido: dias,
      bucket: bucketAntiguedad(dias),
    }
  })

  return filtros.bucket ? resultado.filter((r) => r.bucket === filtros.bucket) : resultado
}

// ---------------------------------------------------------------------------
// 3. Proyección de pagos (cash out)
// ---------------------------------------------------------------------------

export const VENTANAS_PROYECCION = ['esta_semana', 'este_mes', 'proximo_mes', 'despues'] as const
export type VentanaProyeccion = (typeof VENTANAS_PROYECCION)[number]

export const ETIQUETA_VENTANA: Record<VentanaProyeccion, string> = {
  esta_semana: 'Esta semana',
  este_mes: 'Este mes',
  proximo_mes: 'Próximo mes',
  despues: 'Más adelante',
}

export type ReporteProyeccionPagos = {
  ventanas: { ventana: VentanaProyeccion; filas: FilaObligacionAbierta[]; totalPorMoneda: { moneda: string; total: number }[] }[]
}

/** Reusa el detalle de abiertas (misma data, otro agrupamiento) — evita duplicar la query. */
export async function obtenerProyeccionPagos(): Promise<ReporteProyeccionPagos> {
  const filas = await obtenerObligacionesAbiertas({})
  const hoy = new Date()
  const finSemana = new Date(hoy)
  finSemana.setDate(finSemana.getDate() + (7 - hoy.getDay()))
  const finMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0)
  const finProximoMes = new Date(hoy.getFullYear(), hoy.getMonth() + 2, 0)
  const iso = (d: Date) => d.toISOString().slice(0, 10)

  const ventanaDe = (fecha: string | null): VentanaProyeccion => {
    if (!fecha) return 'despues'
    if (fecha <= iso(finSemana)) return 'esta_semana'
    if (fecha <= iso(finMes)) return 'este_mes'
    if (fecha <= iso(finProximoMes)) return 'proximo_mes'
    return 'despues'
  }

  const porVentana = new Map<VentanaProyeccion, FilaObligacionAbierta[]>()
  for (const v of VENTANAS_PROYECCION) porVentana.set(v, [])
  for (const f of filas) porVentana.get(ventanaDe(f.fechaVencimiento))!.push(f)

  return {
    ventanas: VENTANAS_PROYECCION.map((ventana) => {
      const filasVentana = porVentana.get(ventana)!
      return { ventana, filas: filasVentana, totalPorMoneda: sumarPorMoneda(filasVentana) }
    }),
  }
}

function sumarPorMoneda(filas: readonly { moneda: string; netoAPagar: number }[]) {
  const mapa = new Map<string, number>()
  for (const f of filas) mapa.set(f.moneda, (mapa.get(f.moneda) ?? 0) + f.netoAPagar)
  return [...mapa.entries()].map(([moneda, total]) => ({ moneda, total }))
}

// ---------------------------------------------------------------------------
// 4. Historial de pagos
// ---------------------------------------------------------------------------

export type FiltrosHistorialPagos = { proveedorId?: string; fechaDesde?: string; fechaHasta?: string }

export type FilaPago = {
  pagoId: string
  fechaPago: string | null
  quien: string
  moneda: string
  montoAplicado: number
  numeroVoucher: string | null
  obligacionId: string
  obligacionCodigo: string
}

export async function obtenerHistorialPagos(filtros: FiltrosHistorialPagos): Promise<FilaPago[]> {
  const supabase = crearClienteServidor()

  let qPagos = supabase
    .schema('cuentas_x_pagar')
    .from('pagos')
    .select('id, fecha_pago, moneda, numero_voucher')
    .order('fecha_pago', { ascending: false })
    .limit(500)
  if (filtros.fechaDesde) qPagos = qPagos.gte('fecha_pago', filtros.fechaDesde)
  if (filtros.fechaHasta) qPagos = qPagos.lte('fecha_pago', filtros.fechaHasta)

  const { data: pagos, error } = await qPagos
  if (error) throw new Error(`No se pudo listar el historial de pagos: ${error.message}`)
  const pagosIds = (pagos ?? []).map((p: any) => p.id)
  if (pagosIds.length === 0) return []

  const { data: aplicaciones, error: errApl } = await supabase
    .schema('cuentas_x_pagar')
    .from('pago_aplicacion')
    .select('pago_id, obligacion_id, monto_aplicado')
    .in('pago_id', pagosIds)
  if (errApl) throw new Error(`No se pudieron leer las aplicaciones de pago: ${errApl.message}`)

  const obligacionIds = [...new Set((aplicaciones ?? []).map((a: any) => a.obligacion_id))]
  const { data: obligaciones } = await supabase
    .schema('cuentas_x_pagar')
    .from('obligaciones')
    .select(COLUMNAS_BASE)
    .in('id', obligacionIds)
  const obligacionesFiltradas = filtros.proveedorId
    ? (obligaciones ?? []).filter((o: any) => o.proveedor_id === filtros.proveedorId)
    : obligaciones ?? []
  const obligacionesPorId = new Map(obligacionesFiltradas.map((o: any) => [o.id, o as ObligacionBase]))
  const quienDebe = await resolverQuienDebe([...obligacionesPorId.values()])
  const pagosPorId = new Map((pagos ?? []).map((p: any) => [p.id, p]))

  const resultado: FilaPago[] = []
  for (const a of (aplicaciones ?? []) as any[]) {
    const obligacion = obligacionesPorId.get(a.obligacion_id)
    if (!obligacion) continue // filtrada por proveedor, o borrada
    const pago = pagosPorId.get(a.pago_id)
    const quien = quienDebe.get(obligacion.id)
    resultado.push({
      pagoId: a.pago_id,
      fechaPago: pago?.fecha_pago ?? null,
      quien: quien?.proveedor ?? quien?.beneficiario ?? quien?.referencia ?? ETIQUETA_ORIGEN[obligacion.origen],
      moneda: pago?.moneda ?? obligacion.moneda,
      montoAplicado: Number(a.monto_aplicado),
      numeroVoucher: pago?.numero_voucher ?? null,
      obligacionId: obligacion.id,
      obligacionCodigo: obligacion.codigo,
    })
  }
  return resultado.sort((a, b) => (b.fechaPago ?? '').localeCompare(a.fechaPago ?? ''))
}

// ---------------------------------------------------------------------------
// 5. Detracciones (SUNAT-facing) — separado del aging general a propósito
// ---------------------------------------------------------------------------

export type FilaDetraccion = {
  id: string
  codigo: string
  quien: string
  numeroFactura: string | null
  fechaFactura: string | null
  moneda: string
  baseImponible: number
  montoDetraccion: number
  categoria: string | null
  anexoSunat: string | null
  estado: EstadoObligacion
}

export async function obtenerReporteDetracciones(filtros: { fechaDesde?: string; fechaHasta?: string }): Promise<FilaDetraccion[]> {
  const supabase = crearClienteServidor()

  let q = supabase
    .schema('cuentas_x_pagar')
    .from('obligaciones')
    .select(
      `id, codigo, numero_factura, fecha_factura, moneda, base_imponible, monto_detraccion, estado,
       proveedor_id, beneficiario_persona, observaciones, origen, tasa_detraccion_id`
    )
    .gt('monto_detraccion', 0)
    .order('fecha_factura', { ascending: false })
    .limit(500)
  if (filtros.fechaDesde) q = q.gte('fecha_factura', filtros.fechaDesde)
  if (filtros.fechaHasta) q = q.lte('fecha_factura', filtros.fechaHasta)

  const { data, error } = await q
  if (error) throw new Error(`No se pudo armar el reporte de detracciones: ${error.message}`)
  const filas = (data ?? []) as (ObligacionBase & {
    fecha_factura: string | null
    base_imponible: number
    monto_detraccion: number
    tasa_detraccion_id: string | null
  })[]

  const [quienDebe, tasas] = await Promise.all([
    resolverQuienDebe(filas),
    mapaTasasDetraccion([...new Set(filas.map((f) => f.tasa_detraccion_id).filter((x): x is string => !!x))]),
  ])

  return filas.map((f) => {
    const quien = quienDebe.get(f.id)
    const tasa = f.tasa_detraccion_id ? tasas.get(f.tasa_detraccion_id) : null
    return {
      id: f.id,
      codigo: f.codigo,
      quien: quien?.proveedor ?? quien?.beneficiario ?? quien?.referencia ?? ETIQUETA_ORIGEN[f.origen],
      numeroFactura: f.numero_factura,
      fechaFactura: f.fecha_factura,
      moneda: f.moneda,
      baseImponible: Number(f.base_imponible),
      montoDetraccion: Number(f.monto_detraccion),
      categoria: tasa?.categoria ?? null,
      anexoSunat: tasa?.anexo_sunat ?? null,
      estado: f.estado,
    }
  })
}

async function mapaTasasDetraccion(ids: string[]) {
  const supabase = crearClienteServidor()
  if (ids.length === 0) return new Map<string, { categoria: string; anexo_sunat: string | null }>()
  const { data } = await supabase.schema('cuentas_x_pagar').from('tasas_detraccion').select('id, categoria, anexo_sunat').in('id', ids)
  return new Map((data ?? []).map((t: any) => [t.id, { categoria: t.categoria, anexo_sunat: t.anexo_sunat }]))
}

export { ETIQUETA_BUCKET }
