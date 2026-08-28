import 'server-only'
import { crearClienteServidor, exigirUsuario } from '@logisalud/auth/server'
import {
  montoAPagarConNotasCredito,
  puedeEntrarAPropuesta,
} from '@/domain/obligacion'
import {
  siguienteCodigoPropuesta,
  transicionPermitida,
  validarPropuesta,
  type EstadoPropuesta,
} from '@/domain/propuesta'

export type ObligacionConforme = {
  id: string
  codigo: string
  numero_factura: string | null
  moneda: string
  neto_a_pagar: number
  fecha_vencimiento_real: string | null
  proveedor: { razon_social: string } | null
  beneficiario: { nombre: string | null } | null
  notasCreditoSinAplicar: number
}

/** Lo que Tesorería puede meter a una propuesta nueva. */
export async function listarObligacionesConformes(): Promise<ObligacionConforme[]> {
  const supabase = crearClienteServidor()
  const { data, error } = await supabase
    .schema('cuentas_x_pagar')
    .from('obligaciones')
    .select('id, codigo, numero_factura, moneda, neto_a_pagar, fecha_vencimiento_real, proveedor_id, beneficiario_persona')
    .eq('estado', 'conforme')
    .order('fecha_vencimiento_real')

  if (error) throw new Error(`No se pudieron listar las obligaciones conformes: ${error.message}`)
  if ((data ?? []).length === 0) return []

  const [proveedores, beneficiarios, notasCredito] = await Promise.all([
    mapaProveedores([...new Set(data!.map((o) => o.proveedor_id).filter(Boolean))] as string[]),
    mapaBeneficiarios([...new Set(data!.map((o) => o.beneficiario_persona).filter(Boolean))] as string[]),
    mapaNotasCreditoSinAplicar(data!.map((o) => o.id)),
  ])

  return data!.map((o) => ({
    id: o.id,
    codigo: o.codigo,
    numero_factura: o.numero_factura,
    moneda: o.moneda,
    neto_a_pagar: Number(o.neto_a_pagar),
    fecha_vencimiento_real: o.fecha_vencimiento_real,
    proveedor: o.proveedor_id ? proveedores.get(o.proveedor_id) ?? null : null,
    beneficiario: o.beneficiario_persona ? beneficiarios.get(o.beneficiario_persona) ?? null : null,
    notasCreditoSinAplicar: notasCredito.get(o.id) ?? 0,
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

async function cambiarEstadoPropuesta(propuestaId: string, desde: EstadoPropuesta[], hacia: EstadoPropuesta) {
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
  const { error: errUpd } = await supabase.schema('cuentas_x_pagar').from('propuestas_pago').update({ estado: hacia }).eq('id', propuestaId)
  if (errUpd) throw new Error(`No se pudo actualizar la propuesta: ${errUpd.message}`)
  return propuesta
}

/** Tesorería envía la propuesta armada a la aprobación de Gerencia. */
export async function enviarAAprobacion(propuestaId: string): Promise<void> {
  await cambiarEstadoPropuesta(propuestaId, ['borrador'], 'pendiente_aprobacion')
}

/** Gerencia aprueba el lote entero de una vez — nunca obligación por obligación (sección 5 del documento maestro). */
export async function aprobarPropuesta(propuestaId: string): Promise<void> {
  await cambiarEstadoPropuesta(propuestaId, ['pendiente_aprobacion'], 'aprobada')
}

/**
 * Gerencia rechaza el lote. Las obligaciones vuelven a `conforme` para que
 * Tesorería las pueda re-agrupar en otra propuesta — quedarse en
 * `en_propuesta` las dejaría huérfanas, sin ninguna propuesta viva que las
 * contenga.
 */
export async function rechazarPropuesta(propuestaId: string): Promise<void> {
  await cambiarEstadoPropuesta(propuestaId, ['pendiente_aprobacion'], 'rechazada')
  const supabase = crearClienteServidor()
  const { data: detalle } = await supabase.schema('cuentas_x_pagar').from('propuesta_detalle').select('obligacion_id').eq('propuesta_id', propuestaId)
  const obligacionIds = (detalle ?? []).map((d) => d.obligacion_id)
  if (obligacionIds.length > 0) {
    await supabase.schema('cuentas_x_pagar').from('obligaciones').update({ estado: 'conforme' }).in('id', obligacionIds)
  }
}

export type PropuestaListada = {
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
    .select('id, codigo, periodo, estado, created_at, propuesta_detalle(id)')
    .order('created_at', { ascending: false })
  if (error) throw new Error(`No se pudieron listar las propuestas: ${error.message}`)
  return (data ?? []).map((p: any) => ({
    id: p.id, codigo: p.codigo, periodo: p.periodo, estado: p.estado, created_at: p.created_at,
    totalObligaciones: (p.propuesta_detalle ?? []).length,
  }))
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
    proveedor: { razon_social: string } | null
    beneficiario: { nombre: string | null } | null
    estadoObligacion: string
    yaPagada: boolean
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
    .select('id, codigo, numero_factura, moneda, estado, proveedor_id, beneficiario_persona')
    .in('id', obligacionIds)
  const [proveedores, beneficiarios] = await Promise.all([
    mapaProveedores([...new Set((obligaciones ?? []).map((o) => o.proveedor_id).filter(Boolean))] as string[]),
    mapaBeneficiarios([...new Set((obligaciones ?? []).map((o) => o.beneficiario_persona).filter(Boolean))] as string[]),
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
      return {
        obligacionId: d.obligacion_id,
        montoAPagar: Number(d.monto_a_pagar),
        codigo: o?.codigo ?? '—',
        numeroFactura: o?.numero_factura ?? null,
        moneda: o?.moneda ?? 'PEN',
        proveedorId: o?.proveedor_id ?? null,
        proveedor: o?.proveedor_id ? proveedores.get(o.proveedor_id) ?? null : null,
        beneficiario: o?.beneficiario_persona ? beneficiarios.get(o.beneficiario_persona) ?? null : null,
        estadoObligacion: o?.estado ?? 'desconocido',
        yaPagada: pagadas.has(d.obligacion_id),
      }
    }),
  }
}
