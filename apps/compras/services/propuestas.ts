import 'server-only'
import { crearClienteServidor, exigirUsuario, perfilActual } from '@logisalud/auth/server'
import {
  montoAPagarConNotasCredito,
  puedeEntrarAPropuesta,
  type EstadoObligacion,
} from '@/domain/obligacion'
import {
  siguienteCodigoPropuesta,
  transicionPermitida,
  validarPropuesta,
  type EstadoPropuesta,
} from '@/domain/propuesta'
import { puedeAprobarPropuesta, totalesDeLote, type MontoPorMoneda } from '@/domain/propuesta-permisos'
import { mapaCategoriasPagoDirecto, mapaProveedoresBasico } from '@/services/obligaciones'
import {
  cuentaPreferida, mapaCuentasDeLote, type CuentaDeLote,
} from '@/services/cuentas-bancarias-lote'

export type ObligacionConforme = {
  id: string
  codigo: string
  numero_factura: string | null
  moneda: string
  neto_a_pagar: number
  fecha_vencimiento_real: string | null
  proveedor: { razon_social: string } | null
  beneficiario: { nombre: string | null } | null
  /** Fallback de display para prestamo/fraccionamiento_sunat/impuesto — ver ObligacionListada en services/obligaciones.ts. */
  observaciones: string | null
  notasCreditoSinAplicar: number
  origen: string
  estado: EstadoObligacion
  /** Mismo campo que arma `listarObligaciones`: categoría del pago directo
   * y/o las observaciones. Lo pidió Mariela para elegir el lote sin tener
   * que abrir cada obligación. */
  concepto: string | null
}

/** Lo que Tesorería puede meter a una propuesta nueva. */
export async function listarObligacionesConformes(): Promise<ObligacionConforme[]> {
  const supabase = crearClienteServidor()
  const { data, error } = await supabase
    .schema('cuentas_x_pagar')
    .from('obligaciones')
    .select('id, codigo, origen, estado, numero_factura, moneda, neto_a_pagar, fecha_vencimiento_real, proveedor_id, proveedor_servicio_id, beneficiario_persona, observaciones, categoria_pago_directo_id')
    .eq('estado', 'conforme')
    .order('fecha_vencimiento_real')

  if (error) throw new Error(`No se pudieron listar las obligaciones conformes: ${error.message}`)
  if ((data ?? []).length === 0) return []

  // `mapaProveedoresBasico` y no el helper local: un proveedor de SERVICIO
  // vive en otra tabla, y cruzar solo `proveedor_id` dejaba a esas filas
  // diciendo "sin proveedor ni beneficiario" (el mismo bug que ya
  // corregimos en los reportes — un solo helper para todo el módulo).
  const [proveedores, beneficiarios, notasCredito, categoriasPD] = await Promise.all([
    mapaProveedoresBasico(
      [...new Set(data!.map((o) => o.proveedor_id).filter(Boolean))] as string[],
      [...new Set(data!.map((o: any) => o.proveedor_servicio_id).filter(Boolean))] as string[]
    ),
    mapaBeneficiarios([...new Set(data!.map((o) => o.beneficiario_persona).filter(Boolean))] as string[]),
    mapaNotasCreditoSinAplicar(data!.map((o) => o.id)),
    mapaCategoriasPagoDirecto(data!.map((o: any) => o.categoria_pago_directo_id)),
  ])

  return data!.map((o) => ({
    id: o.id,
    codigo: o.codigo,
    numero_factura: o.numero_factura,
    moneda: o.moneda,
    neto_a_pagar: Number(o.neto_a_pagar),
    fecha_vencimiento_real: o.fecha_vencimiento_real,
    proveedor: proveedores.get(o.proveedor_id ?? (o as any).proveedor_servicio_id ?? '') ?? null,
    beneficiario: o.beneficiario_persona ? beneficiarios.get(o.beneficiario_persona) ?? null : null,
    observaciones: o.observaciones,
    notasCreditoSinAplicar: notasCredito.get(o.id) ?? 0,
    origen: (o as any).origen,
    estado: (o as any).estado as EstadoObligacion,
    concepto: [categoriasPD.get((o as any).categoria_pago_directo_id ?? ''), o.observaciones?.trim()]
      .filter((p): p is string => !!p)
      .join(' — ') || null,
  }))
}

async function mapaProveedores(ids: string[]) {
  const supabase = crearClienteServidor()
  if (ids.length === 0) return new Map()
  const { data } = await supabase.schema('compras').from('proveedores').select('id, razon_social').in('id', ids)
  return new Map((data ?? []).map((p: any) => [p.id, { razon_social: p.razon_social }]))
}

/** Origen gasto_directo/reembolso/anticipo: el beneficiario es un empleado, no un proveedor. */
async function mapaBeneficiarios(ids: string[]) {
  const supabase = crearClienteServidor()
  if (ids.length === 0) return new Map()
  const { data } = await supabase.from('perfiles').select('id, nombre').in('id', ids)
  return new Map((data ?? []).map((p: any) => [p.id, { nombre: p.nombre }]))
}

/** Notas de crédito aplicadas por obligación — las que se restan al armar la propuesta. */
async function mapaNotasCreditoAplicadas(obligacionIds: string[]) {
  const supabase = crearClienteServidor()
  if (obligacionIds.length === 0) return new Map<string, number>()
  const { data } = await supabase
    .schema('compras')
    .from('notas_credito')
    .select('obligacion_id, monto')
    .in('obligacion_id', obligacionIds)
    .eq('aplicada', true)
  const mapa = new Map<string, number>()
  for (const nc of data ?? []) {
    mapa.set(nc.obligacion_id, (mapa.get(nc.obligacion_id) ?? 0) + Number(nc.monto))
  }
  return mapa
}

/** Aviso informativo para Tesorería: hay una NC sin aplicar que Contabilidad todavía no confirmó. */
async function mapaNotasCreditoSinAplicar(obligacionIds: string[]) {
  const supabase = crearClienteServidor()
  if (obligacionIds.length === 0) return new Map<string, number>()
  const { data } = await supabase
    .schema('compras')
    .from('notas_credito')
    .select('obligacion_id, monto')
    .in('obligacion_id', obligacionIds)
    .eq('aplicada', false)
  const mapa = new Map<string, number>()
  for (const nc of data ?? []) {
    mapa.set(nc.obligacion_id, (mapa.get(nc.obligacion_id) ?? 0) + Number(nc.monto))
  }
  return mapa
}

/**
 * Arma la propuesta: agrupa las obligaciones elegidas, calcula
 * `monto_a_pagar` restando las notas de crédito ya aplicadas (regla 9), y
 * mueve las obligaciones a `en_propuesta` para que no puedan entrar a otra
 * propuesta en paralelo.
 */
export async function crearPropuesta(obligacionIds: string[]): Promise<{ id: string }> {
  const errores = validarPropuesta(obligacionIds)
  if (errores.length > 0) throw new Error(errores[0].mensaje)

  const usuario = await exigirUsuario()
  const supabase = crearClienteServidor()

  const { data: obligaciones, error: errOb } = await supabase
    .schema('cuentas_x_pagar')
    .from('obligaciones')
    .select('id, estado, neto_a_pagar')
    .in('id', obligacionIds)
  if (errOb) throw new Error(`No se pudieron leer las obligaciones: ${errOb.message}`)

  const invalidas = (obligaciones ?? []).filter((o) => !puedeEntrarAPropuesta(o.estado))
  if (invalidas.length > 0) {
    throw new Error('Alguna de las obligaciones elegidas ya no está conforme (puede que otra propuesta se la haya llevado).')
  }

  const notasAplicadas = await mapaNotasCreditoAplicadas(obligacionIds)

  const anio = new Date().getFullYear()
  const { data: ultima } = await supabase
    .schema('cuentas_x_pagar')
    .from('propuestas_pago')
    .select('codigo')
    .like('codigo', `PP-${anio}-%`)
    .order('codigo', { ascending: false })
    .limit(1)
    .maybeSingle()
  const codigo = siguienteCodigoPropuesta(anio, ultima?.codigo ?? null)

  const { data: propuesta, error: errIns } = await supabase
    .schema('cuentas_x_pagar')
    .from('propuestas_pago')
    .insert({ codigo, periodo: `${anio}-S${Math.ceil((new Date().getMonth() + 1) / 1)}`, creado_por: usuario.id, estado: 'borrador' })
    .select('id')
    .single()
  if (errIns) throw new Error(`No se pudo crear la propuesta: ${errIns.message}`)

  const { error: errDet } = await supabase
    .schema('cuentas_x_pagar')
    .from('propuesta_detalle')
    .insert(
      (obligaciones ?? []).map((o) => ({
        propuesta_id: propuesta.id,
        obligacion_id: o.id,
        monto_a_pagar: montoAPagarConNotasCredito(Number(o.neto_a_pagar), [notasAplicadas.get(o.id) ?? 0]),
      }))
    )
  if (errDet) {
    await supabase.schema('cuentas_x_pagar').from('propuestas_pago').delete().eq('id', propuesta.id)
    throw new Error(`No se pudieron guardar las obligaciones de la propuesta: ${errDet.message}`)
  }

  await supabase.schema('cuentas_x_pagar').from('obligaciones').update({ estado: 'en_propuesta' }).in('id', obligacionIds)

  return { id: propuesta.id }
}

async function cambiarEstadoPropuesta(
  propuestaId: string,
  desde: EstadoPropuesta[],
  hacia: EstadoPropuesta,
  /** Columnas extra del mismo update — ej. `fecha_aprobacion` al aprobar. */
  campos: Record<string, unknown> = {}
) {
  const supabase = crearClienteServidor()
  const { data: propuesta, error } = await supabase
    .schema('cuentas_x_pagar')
    .from('propuestas_pago')
    .select('id, estado')
    .eq('id', propuestaId)
    .maybeSingle()
  if (error || !propuesta) throw new Error('No se encontró la propuesta.')
  if (!desde.includes(propuesta.estado) || !transicionPermitida(propuesta.estado, hacia)) {
    throw new Error(`La propuesta está en "${propuesta.estado}" y no puede pasar a "${hacia}".`)
  }
  const { error: errUpd } = await supabase
    .schema('cuentas_x_pagar')
    .from('propuestas_pago')
    .update({ estado: hacia, ...campos })
    .eq('id', propuestaId)
  if (errUpd) throw new Error(`No se pudo actualizar la propuesta: ${errUpd.message}`)
  return propuesta
}

/** Tesorería envía la propuesta armada a la aprobación de Gerencia. */
export async function enviarAAprobacion(propuestaId: string): Promise<void> {
  await cambiarEstadoPropuesta(propuestaId, ['borrador'], 'pendiente_aprobacion')
}

/** Gerencia aprueba el lote entero de una vez — nunca obligación por obligación (sección 5 del documento maestro). */
/**
 * Pieza I: aprobar el lote pasa de Gerencia a Contabilidad rol admin o
 * admin — ver domain/propuesta-permisos.ts. El chequeo va acá y no solo en
 * la policy porque hoy el flag `acceso_abierto_temporal` la anula.
 */
export async function aprobarPropuesta(propuestaId: string): Promise<void> {
  if (!puedeAprobarPropuesta(await perfilActual())) {
    throw new Error('Solo Contabilidad (rol admin) o un administrador pueden aprobar una propuesta de pago.')
  }
  await cambiarEstadoPropuesta(propuestaId, ['pendiente_aprobacion'], 'aprobada', {
    fecha_aprobacion: new Date().toISOString(),
  })
}

/**
 * Gerencia rechaza el lote. Las obligaciones vuelven a `conforme` para que
 * Tesorería las pueda re-agrupar en otra propuesta — quedarse en
 * `en_propuesta` las dejaría huérfanas, sin ninguna propuesta viva que las
 * contenga.
 */
export async function rechazarPropuesta(propuestaId: string): Promise<void> {
  if (!puedeAprobarPropuesta(await perfilActual())) {
    throw new Error('Solo Contabilidad (rol admin) o un administrador pueden rechazar una propuesta de pago.')
  }
  await cambiarEstadoPropuesta(propuestaId, ['pendiente_aprobacion'], 'rechazada')
  const supabase = crearClienteServidor()
  const { data: detalle } = await supabase.schema('cuentas_x_pagar').from('propuesta_detalle').select('obligacion_id').eq('propuesta_id', propuestaId)
  const obligacionIds = (detalle ?? []).map((d) => d.obligacion_id)
  if (obligacionIds.length > 0) {
    await supabase.schema('cuentas_x_pagar').from('obligaciones').update({ estado: 'conforme' }).in('id', obligacionIds)
  }
}

export type PropuestaListada = {
  /** Cuándo se aprobó el lote (migración 0050). Null si nunca se aprobó, o
   * si se aprobó antes de esa migración. */
  fecha_aprobacion?: string | null
  /** Totales del lote agrupados por moneda — nunca un único número: una
   * propuesta puede mezclar PEN y USD (Pieza I). */
  totalPorMoneda?: MontoPorMoneda[]
  pendientePorMoneda?: MontoPorMoneda[]
  id: string
  codigo: string
  periodo: string | null
  estado: EstadoPropuesta
  created_at: string
  totalObligaciones: number
}

export async function listarPropuestas(): Promise<PropuestaListada[]> {
  const supabase = crearClienteServidor()
  const { data, error } = await supabase
    .schema('cuentas_x_pagar')
    .from('propuestas_pago')
    .select('id, codigo, periodo, estado, created_at, fecha_aprobacion, propuesta_detalle(id, obligacion_id, monto_a_pagar)')
    .order('created_at', { ascending: false })
  if (error) throw new Error(`No se pudieron listar las propuestas: ${error.message}`)

  const filas = (data ?? []) as any[]
  // La moneda vive en la obligación, no en el detalle (cross-schema no, pero
  // sí otra tabla) — y sin ella no se puede agrupar sin mentir. Una consulta
  // más para todas las propuestas juntas, no una por fila.
  const detalleIds = filas.flatMap((p) => (p.propuesta_detalle ?? []).map((d: any) => d.obligacion_id))
  const [monedas, pagadas] = await Promise.all([
    mapaMonedas(detalleIds),
    idsYaPagadas(detalleIds),
  ])

  return filas.map((p: any) => {
    const lineas = (p.propuesta_detalle ?? []).map((d: any) => ({
      moneda: monedas.get(d.obligacion_id) ?? 'PEN',
      montoAPagar: Number(d.monto_a_pagar),
      yaPagada: pagadas.has(d.obligacion_id),
    }))
    const totales = totalesDeLote(lineas)
    return {
      id: p.id, codigo: p.codigo, periodo: p.periodo, estado: p.estado, created_at: p.created_at,
      fecha_aprobacion: p.fecha_aprobacion ?? null,
      totalObligaciones: lineas.length,
      totalPorMoneda: totales.total,
      pendientePorMoneda: totales.pendiente,
    }
  })
}

async function mapaMonedas(obligacionIds: string[]): Promise<Map<string, string>> {
  const mapa = new Map<string, string>()
  const ids = [...new Set(obligacionIds)]
  if (ids.length === 0) return mapa
  const supabase = crearClienteServidor()
  const { data } = await supabase.schema('cuentas_x_pagar').from('obligaciones').select('id, moneda').in('id', ids)
  for (const o of (data ?? []) as any[]) mapa.set(o.id, o.moneda)
  return mapa
}

async function idsYaPagadas(obligacionIds: string[]): Promise<Set<string>> {
  const ids = [...new Set(obligacionIds)]
  if (ids.length === 0) return new Set()
  const supabase = crearClienteServidor()
  const { data } = await supabase.schema('cuentas_x_pagar').from('pago_aplicacion').select('obligacion_id').in('obligacion_id', ids)
  return new Set((data ?? []).map((p: any) => p.obligacion_id))
}

export type PropuestaDetalle = {
  id: string
  codigo: string
  periodo: string | null
  estado: EstadoPropuesta
  detalle: {
    obligacionId: string
    montoAPagar: number
    codigo: string
    numeroFactura: string | null
    moneda: string
    proveedorId: string | null
    /** El de servicios vive en otra tabla; la pantalla de pago necesita
     * saber cuál de los dos es para ofrecer las cuentas correctas. */
    proveedorServicioId: string | null
    proveedor: { razon_social: string } | null
    beneficiarioPersonaId: string | null
    beneficiario: { nombre: string | null } | null
    observaciones: string | null
    concepto: string | null
    estadoObligacion: string
    yaPagada: boolean
    /** Todas las cuentas de quien cobra — traídas en bloque, no una
     * consulta por línea (Pieza 4). Vacío = falta matricular la cuenta, y
     * la pantalla lo avisa antes de que Tesorería intente pagar. */
    cuentas: CuentaDeLote[]
    cuentaPreferida: CuentaDeLote | null
  }[]
}

export async function obtenerPropuesta(id: string): Promise<PropuestaDetalle | null> {
  const supabase = crearClienteServidor()
  const { data, error } = await supabase
    .schema('cuentas_x_pagar')
    .from('propuestas_pago')
    .select('id, codigo, periodo, estado, propuesta_detalle(obligacion_id, monto_a_pagar)')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`No se pudo leer la propuesta: ${error.message}`)
  if (!data) return null

  const detalle: any[] = (data as any).propuesta_detalle ?? []
  const obligacionIds = detalle.map((d) => d.obligacion_id)
  if (obligacionIds.length === 0) return { id: data.id, codigo: data.codigo, periodo: data.periodo, estado: data.estado, detalle: [] }

  const { data: obligaciones } = await supabase
    .schema('cuentas_x_pagar')
    .from('obligaciones')
    .select('id, codigo, numero_factura, moneda, estado, proveedor_id, proveedor_servicio_id, beneficiario_persona, observaciones, categoria_pago_directo_id')
    .in('id', obligacionIds)
  const idsCompra = [...new Set((obligaciones ?? []).map((o) => o.proveedor_id).filter(Boolean))] as string[]
  const idsServicio = [...new Set((obligaciones ?? []).map((o: any) => o.proveedor_servicio_id).filter(Boolean))] as string[]
  const idsEmpleado = [...new Set((obligaciones ?? []).map((o) => o.beneficiario_persona).filter(Boolean))] as string[]
  // Cuatro consultas fijas para todo el lote, no cuatro por línea: antes
  // esto se resolvía dentro del `.map()` de la pantalla (Pieza 4).
  const [proveedores, beneficiarios, categoriasPD, cuentas] = await Promise.all([
    mapaProveedoresBasico(idsCompra, idsServicio),
    mapaBeneficiarios(idsEmpleado),
    mapaCategoriasPagoDirecto((obligaciones ?? []).map((o: any) => o.categoria_pago_directo_id)),
    mapaCuentasDeLote({
      proveedoresCompra: idsCompra,
      proveedoresServicio: idsServicio,
      empleados: idsEmpleado,
    }),
  ])
  const obligacionesMap = new Map((obligaciones ?? []).map((o) => [o.id, o]))

  const { data: pagosAplicados } = await supabase.schema('cuentas_x_pagar').from('pago_aplicacion').select('obligacion_id').in('obligacion_id', obligacionIds)
  const pagadas = new Set((pagosAplicados ?? []).map((p) => p.obligacion_id))

  return {
    id: data.id,
    codigo: data.codigo,
    periodo: data.periodo,
    estado: data.estado,
    detalle: detalle.map((d) => {
      const o = obligacionesMap.get(d.obligacion_id)
      const claveCuentas =
        o?.proveedor_id ?? (o as any)?.proveedor_servicio_id ?? o?.beneficiario_persona ?? ''
      const cuentasDe = cuentas.get(claveCuentas) ?? []
      return {
        obligacionId: d.obligacion_id,
        montoAPagar: Number(d.monto_a_pagar),
        codigo: o?.codigo ?? '—',
        numeroFactura: o?.numero_factura ?? null,
        moneda: o?.moneda ?? 'PEN',
        proveedorId: o?.proveedor_id ?? null,
        proveedorServicioId: (o as any)?.proveedor_servicio_id ?? null,
        proveedor: proveedores.get(o?.proveedor_id ?? (o as any)?.proveedor_servicio_id ?? '') ?? null,
        beneficiarioPersonaId: o?.beneficiario_persona ?? null,
        beneficiario: o?.beneficiario_persona ? beneficiarios.get(o.beneficiario_persona) ?? null : null,
        observaciones: o?.observaciones ?? null,
        concepto: [
          categoriasPD.get((o as any)?.categoria_pago_directo_id ?? ''),
          o?.observaciones?.trim(),
        ].filter((p): p is string => !!p).join(' — ') || null,
        estadoObligacion: o?.estado ?? 'desconocido',
        yaPagada: pagadas.has(d.obligacion_id),
        cuentas: cuentasDe,
        cuentaPreferida: cuentaPreferida(cuentasDe),
      }
    }),
  }
}
