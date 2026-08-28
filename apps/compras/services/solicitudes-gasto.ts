import 'server-only'
import { crearClienteServidor, exigirUsuario, perfilActual } from '@logisalud/auth/server'
import { TASA_IGV } from '@/domain/obligacion'
import {
  calcularLiquidacion,
  estadoTrasPago,
  type BorradorSolicitud,
  type EstadoSolicitud,
  type TipoSolicitud,
} from '@/domain/gasto'

export type CategoriaGasto = { id: string; nombre: string; cuenta_contable: string | null }

export async function listarCategoriasGasto(): Promise<CategoriaGasto[]> {
  const supabase = crearClienteServidor()
  const { data, error } = await supabase
    .schema('gastos')
    .from('categorias_gasto')
    .select('id, nombre, cuenta_contable')
    .eq('activo', true)
    .order('nombre')
  if (error) throw new Error(`No se pudieron listar las categorías de gasto: ${error.message}`)
  return data ?? []
}

/**
 * Crea la solicitud. `area` sale del perfil de quien la crea, nunca del
 * formulario — la policy `solicitudes_gasto_crea` exige `area = mi_area()`,
 * así que mandar cualquier otra cosa la rechazaría igual, pero es más claro
 * resolverla acá que dejar que RLS sea la única explicación del error.
 */
export async function crearSolicitud(borrador: BorradorSolicitud): Promise<{ id: string }> {
  const usuario = await exigirUsuario()
  const perfil = await perfilActual()
  if (!perfil?.area) throw new Error('Tu cuenta no tiene un área asignada — no se puede crear la solicitud.')

  const supabase = crearClienteServidor()
  const { data, error } = await supabase
    .schema('gastos')
    .from('solicitudes_gasto')
    .insert({
      tipo: borrador.tipo,
      solicitante_id: usuario.id,
      area: perfil.area,
      categoria_id: borrador.categoriaId,
      moneda: borrador.moneda,
      monto_solicitado: borrador.montoSolicitado,
      descripcion: borrador.descripcion,
      destino: borrador.destino ?? null,
      fecha_inicio: borrador.fechaInicio ?? null,
      fecha_fin: borrador.fechaFin ?? null,
    })
    .select('id')
    .single()

  if (error) throw new Error(`No se pudo crear la solicitud: ${error.message}`)
  return data
}

export type SolicitudListada = {
  id: string
  codigo: string
  tipo: TipoSolicitud
  estado: EstadoSolicitud
  moneda: string
  monto_solicitado: number
  descripcion: string
  area: string
  created_at: string
}

export async function listarMisSolicitudes(): Promise<SolicitudListada[]> {
  const usuario = await exigirUsuario()
  const supabase = crearClienteServidor()
  const { data, error } = await supabase
    .schema('gastos')
    .from('solicitudes_gasto')
    .select('id, codigo, tipo, estado, moneda, monto_solicitado, descripcion, area, created_at')
    .eq('solicitante_id', usuario.id)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`No se pudieron listar tus solicitudes: ${error.message}`)
  return data ?? []
}

/**
 * Bandeja de "esperando una decisión mía ahora": RLS ya filtra a quien
 * puede verlas (jefe del área o contabilidad/tesorería/gerencia/admin), acá
 * solo se acota a los dos estados donde alguien tiene que decidir.
 */
export async function listarSolicitudesPendientes(): Promise<SolicitudListada[]> {
  const supabase = crearClienteServidor()
  const { data, error } = await supabase
    .schema('gastos')
    .from('solicitudes_gasto')
    .select('id, codigo, tipo, estado, moneda, monto_solicitado, descripcion, area, created_at')
    .in('estado', ['pendiente_jefe', 'pendiente_contabilidad'])
    .order('created_at')
  if (error) throw new Error(`No se pudieron listar las solicitudes pendientes: ${error.message}`)
  return data ?? []
}

export type ComprobanteGasto = {
  id: string
  fase: 'inicial' | 'rendicion'
  tipo_comprobante: string
  numero: string | null
  monto: number
  sustentable: boolean
  storage_path: string | null
}

export type SolicitudDetalle = SolicitudListada & {
  destino: string | null
  fecha_inicio: string | null
  fecha_fin: string | null
  categoria: { nombre: string } | null
  comprobantes: ComprobanteGasto[]
  liquidacion: {
    monto_anticipo: number
    monto_sustentado: number
    diferencia: number
    resultado: string
    fecha_liquidacion: string | null
  } | null
}

export async function obtenerSolicitud(id: string): Promise<SolicitudDetalle | null> {
  const supabase = crearClienteServidor()
  const { data, error } = await supabase
    .schema('gastos')
    .from('solicitudes_gasto')
    .select(`id, codigo, tipo, estado, moneda, monto_solicitado, descripcion, area, created_at,
             destino, fecha_inicio, fecha_fin, categoria_id,
             solicitud_comprobantes(id, fase, tipo_comprobante, numero, monto, sustentable, storage_path)`)
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(`No se pudo leer la solicitud: ${error.message}`)
  if (!data) return null

  const [{ data: categoria }, { data: liquidacion }] = await Promise.all([
    supabase.schema('gastos').from('categorias_gasto').select('nombre').eq('id', (data as any).categoria_id).maybeSingle(),
    supabase
      .schema('gastos')
      .from('liquidaciones_anticipo')
      .select('monto_anticipo, monto_sustentado, diferencia, resultado, fecha_liquidacion')
      .eq('solicitud_id', id)
      .maybeSingle(),
  ])

  return { ...(data as any), categoria, liquidacion }
}

async function cambiarEstado(id: string, desde: EstadoSolicitud[], hacia: EstadoSolicitud, campos: Record<string, unknown> = {}) {
  const supabase = crearClienteServidor()
  const { data: solicitud, error } = await supabase.schema('gastos').from('solicitudes_gasto').select('id, estado').eq('id', id).maybeSingle()
  if (error || !solicitud) throw new Error('No se encontró la solicitud.')
  if (!desde.includes(solicitud.estado)) {
    throw new Error(`La solicitud está en "${solicitud.estado}" y no se puede mover desde ahí.`)
  }
  const { error: errUpd } = await supabase.schema('gastos').from('solicitudes_gasto').update({ estado: hacia, ...campos }).eq('id', id)
  if (errUpd) throw new Error(`No se pudo actualizar la solicitud: ${errUpd.message}`)
}

export async function aprobarPorJefe(id: string): Promise<void> {
  const usuario = await exigirUsuario()
  await cambiarEstado(id, ['pendiente_jefe'], 'pendiente_contabilidad', {
    aprobado_jefe_por: usuario.id, aprobado_jefe_fecha: new Date().toISOString(),
  })
}

export async function rechazarPorJefe(id: string): Promise<void> {
  const usuario = await exigirUsuario()
  await cambiarEstado(id, ['pendiente_jefe'], 'rechazada_jefe', {
    aprobado_jefe_por: usuario.id, aprobado_jefe_fecha: new Date().toISOString(),
  })
}

export async function rechazarPorContabilidad(id: string): Promise<void> {
  const usuario = await exigirUsuario()
  await cambiarEstado(id, ['pendiente_contabilidad'], 'rechazada_contabilidad', {
    aprobado_contabilidad_por: usuario.id, aprobado_contabilidad_fecha: new Date().toISOString(),
  })
}

/**
 * Regla 6: cuando Contabilidad aprueba, se genera la obligación sola — nadie
 * la registra a mano como en Compras. De ahí en más sigue el embudo normal
 * de Cuentas por Pagar (conformidad, propuesta, aprobación de Gerencia,
 * pago) exactamente igual que una obligación de compra.
 *
 * PENDIENTE DE CONFIRMAR CON CONTABILIDAD (no está en el documento
 * maestro): `cuentas_x_pagar.obligaciones.igv`/`total` son columnas
 * generadas como `base_imponible * 18%` — siempre, sin excepción, porque
 * así está definida la tabla. Un reembolso o anticipo a un empleado no es
 * necesariamente una operación gravada con IGV. Para que el monto que
 * Tesorería termina pagando (`neto_a_pagar`) coincida con
 * `monto_solicitado` (lo que de verdad importa operativamente), acá se
 * calcula `base_imponible` hacia atrás desde el monto solicitado — el
 * desglose base/IGV que muestra la obligación es un artefacto aritmético
 * de esta fórmula, no una detracción o cálculo tributario real para este
 * origen. Si Contabilidad necesita que el desglose sea distinto, este es
 * el lugar para ajustarlo.
 */
export async function aprobarPorContabilidad(id: string): Promise<void> {
  const usuario = await exigirUsuario()
  const supabase = crearClienteServidor()

  const { data: solicitud, error } = await supabase
    .schema('gastos')
    .from('solicitudes_gasto')
    .select('id, tipo, solicitante_id, moneda, monto_solicitado, estado')
    .eq('id', id)
    .maybeSingle()
  if (error || !solicitud) throw new Error('No se encontró la solicitud.')
  if (solicitud.estado !== 'pendiente_contabilidad') {
    throw new Error(`La solicitud está en "${solicitud.estado}", no en espera de Contabilidad.`)
  }

  const baseImponible = Math.round((Number(solicitud.monto_solicitado) / (1 + TASA_IGV)) * 100) / 100

  const { data: obligacion, error: errOb } = await supabase
    .schema('cuentas_x_pagar')
    .from('obligaciones')
    .insert({
      origen: solicitud.tipo,
      beneficiario_persona: solicitud.solicitante_id,
      solicitud_gasto_id: solicitud.id,
      moneda: solicitud.moneda,
      base_imponible: baseImponible,
      estado: 'registrada',
      created_by: usuario.id,
    })
    .select('id')
    .single()
  if (errOb) throw new Error(`No se pudo generar la obligación: ${errOb.message}`)

  const { error: errUpd } = await supabase
    .schema('gastos')
    .from('solicitudes_gasto')
    .update({
      estado: 'aprobada',
      aprobado_contabilidad_por: usuario.id,
      aprobado_contabilidad_fecha: new Date().toISOString(),
      obligacion_id: obligacion.id,
    })
    .eq('id', id)
  if (errUpd) throw new Error(`La obligación se creó pero no se pudo actualizar la solicitud: ${errUpd.message}`)
}

/**
 * Se llama desde services/pagos.ts justo después de marcar 'pagada' una
 * obligación con `solicitud_gasto_id` — mueve la solicitud al estado que le
 * corresponde según su tipo (regla 6, ver estadoTrasPago en domain/gasto.ts).
 * No lanza si la solicitud no existe o ya cambió de estado por su cuenta:
 * el pago ya se registró, esto es una propagación de estado, no la
 * operación principal.
 */
export async function marcarSolicitudPagada(obligacionId: string): Promise<void> {
  const supabase = crearClienteServidor()
  const { data: solicitud } = await supabase
    .schema('gastos')
    .from('solicitudes_gasto')
    .select('id, tipo, estado')
    .eq('obligacion_id', obligacionId)
    .maybeSingle()
  if (!solicitud || solicitud.estado !== 'aprobada') return

  await supabase
    .schema('gastos')
    .from('solicitudes_gasto')
    .update({ estado: estadoTrasPago(solicitud.tipo) })
    .eq('id', solicitud.id)
}

export async function subirComprobante(input: {
  solicitudId: string
  fase: 'inicial' | 'rendicion'
  tipoComprobante: 'factura' | 'boleta' | 'sin_comprobante'
  numero?: string | null
  rucEmisor?: string | null
  monto: number
  sustentable: boolean
}): Promise<void> {
  if (input.monto <= 0) throw new Error('El monto del comprobante tiene que ser mayor a 0.')
  const supabase = crearClienteServidor()
  const { error } = await supabase.schema('gastos').from('solicitud_comprobantes').insert({
    solicitud_id: input.solicitudId,
    fase: input.fase,
    tipo_comprobante: input.tipoComprobante,
    numero: input.numero ?? null,
    ruc_emisor: input.rucEmisor ?? null,
    monto: input.monto,
    sustentable: input.sustentable,
  })
  if (error) throw new Error(`No se pudo guardar el comprobante: ${error.message}`)
}

/**
 * Regla 7: Contabilidad liquida el anticipo con los comprobantes de
 * rendición ya subidos. Si el resultado es `reembolso_adicional`, genera
 * automáticamente la obligación extra por la diferencia — el empleado
 * gastó de más y hay que devolvérselo, con el mismo embudo de pago que
 * cualquier otra obligación.
 */
export async function liquidarAnticipo(solicitudId: string): Promise<void> {
  const usuario = await exigirUsuario()
  const supabase = crearClienteServidor()

  const { data: solicitud, error } = await supabase
    .schema('gastos')
    .from('solicitudes_gasto')
    .select('id, tipo, estado, moneda, solicitante_id, monto_solicitado, solicitud_comprobantes(fase, monto, sustentable)')
    .eq('id', solicitudId)
    .maybeSingle()
  if (error || !solicitud) throw new Error('No se encontró la solicitud.')
  if (solicitud.tipo !== 'anticipo') throw new Error('Solo un anticipo se liquida — un gasto directo o reembolso se cierra solo al pagarse.')
  if (solicitud.estado !== 'pendiente_rendicion') throw new Error('Esta solicitud no está esperando rendición.')

  const comprobantesRendicion = ((solicitud as any).solicitud_comprobantes ?? []).filter((c: any) => c.fase === 'rendicion')
  const liquidacion = calcularLiquidacion(
    Number(solicitud.monto_solicitado),
    comprobantesRendicion.map((c: any) => ({ monto: Number(c.monto), sustentable: c.sustentable }))
  )

  const { error: errLiq } = await supabase.schema('gastos').from('liquidaciones_anticipo').insert({
    solicitud_id: solicitudId,
    monto_anticipo: solicitud.monto_solicitado,
    monto_sustentado: liquidacion.montoSustentado,
    liquidado_por: usuario.id,
    fecha_liquidacion: new Date().toISOString(),
  })
  if (errLiq) throw new Error(`No se pudo registrar la liquidación: ${errLiq.message}`)

  if (liquidacion.resultado === 'reembolso_adicional') {
    const montoAdicional = Math.abs(liquidacion.diferencia)
    const baseImponible = Math.round((montoAdicional / (1 + TASA_IGV)) * 100) / 100
    const { data: obligacion, error: errOb } = await supabase
      .schema('cuentas_x_pagar')
      .from('obligaciones')
      .insert({
        origen: 'reembolso',
        beneficiario_persona: solicitud.solicitante_id,
        solicitud_gasto_id: solicitudId,
        moneda: solicitud.moneda,
        base_imponible: baseImponible,
        estado: 'registrada',
        created_by: usuario.id,
      })
      .select('id')
      .single()
    if (errOb) throw new Error(`La liquidación se guardó pero no se pudo generar el reembolso adicional: ${errOb.message}`)

    await supabase
      .schema('gastos')
      .from('liquidaciones_anticipo')
      .update({ obligacion_reembolso_id: obligacion.id })
      .eq('solicitud_id', solicitudId)
  }

  await cambiarEstado(solicitudId, ['pendiente_rendicion'], 'rendida')
}
