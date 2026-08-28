import 'server-only'
import { crearClienteServidor, exigirUsuario, perfilActual } from '@logisalud/auth/server'
import { TASA_IGV } from '@/domain/obligacion'
import {
  calcularLiquidacion,
  estadoTrasPago,
  montoTotalSolicitud,
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

/** RLS (`categorias_gasto_escritura`) ya restringe esto a contabilidad/admin. */
export async function crearCategoriaGasto(nombre: string, cuentaContable?: string): Promise<void> {
  const supabase = crearClienteServidor()
  const { error } = await supabase
    .schema('gastos')
    .from('categorias_gasto')
    .insert({ nombre, cuenta_contable: cuentaContable || null })
  if (error) throw new Error(`No se pudo crear la categoría: ${error.message}`)
}

/**
 * Crea la solicitud. `area` sale del perfil de quien la crea, nunca del
 * formulario — la policy `solicitudes_gasto_crea` exige `area = mi_area()`,
 * así que mandar cualquier otra cosa la rechazaría igual, pero es más claro
 * resolverla acá que dejar que RLS sea la única explicación del error.
 */
export async function crearSolicitud(borrador: BorradorSolicitud): Promise<{ id: string; codigo: string }> {
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
      monto_solicitado: montoTotalSolicitud(borrador),
      base_imponible: borrador.tipo === 'anticipo' ? null : borrador.baseImponible,
      igv: borrador.tipo === 'anticipo' ? null : borrador.igv,
      descripcion: borrador.descripcion,
      destino: borrador.destino ?? null,
      fecha_inicio: borrador.fechaInicio ?? null,
      fecha_fin: borrador.fechaFin ?? null,
      asignado_a: borrador.tipo === 'anticipo' ? borrador.asignadoA ?? null : null,
    })
    .select('id, codigo')
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
  /** Nombre de a quién van los viáticos, si no es quien creó la solicitud. */
  asignadoA: string | null
  /** Fase 1.9 ("el voucher cierra el ciclo"): cuando ya se pagó, el voucher
   * real vive en cuentas_x_pagar.pagos — se enlaza a esa pantalla en vez de
   * duplicar el visor de archivos acá. */
  obligacion_id: string | null
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
             destino, fecha_inicio, fecha_fin, categoria_id, asignado_a, obligacion_id,
             comprobantes:solicitud_comprobantes(id, fase, tipo_comprobante, numero, monto, sustentable, storage_path)`)
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(`No se pudo leer la solicitud: ${error.message}`)
  if (!data) return null

  const asignadoA = (data as any).asignado_a as string | null
  const [{ data: categoria }, { data: liquidacion }, { data: asignado }] = await Promise.all([
    supabase.schema('gastos').from('categorias_gasto').select('nombre').eq('id', (data as any).categoria_id).maybeSingle(),
    supabase
      .schema('gastos')
      .from('liquidaciones_anticipo')
      .select('monto_anticipo, monto_sustentado, diferencia, resultado, fecha_liquidacion')
      .eq('solicitud_id', id)
      .maybeSingle(),
    asignadoA
      ? supabase.from('perfiles').select('nombre').eq('id', asignadoA).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  return { ...(data as any), categoria, liquidacion, asignadoA: asignado?.nombre ?? null }
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
 * El sistema NUNCA inventa el desglose base/IGV: para gasto_directo y
 * reembolso ya existe un comprobante real, y quien creó la solicitud lo
 * transcribió a mano en `crearSolicitud()` — acá simplemente se usa tal
 * cual (confirmado con Sebas después de la primera versión de este PR, que
 * SÍ lo inventaba hacia atrás desde el monto total).
 *
 * PENDIENTE DE CONFIRMAR CON CONTABILIDAD: un `anticipo` es plata que sale
 * ANTES del gasto real, así que todavía no hay ningún comprobante que
 * transcribir — para ese caso se sigue calculando la base hacia atrás
 * asumiendo 18% de IGV, que es un artefacto aritmético para que
 * `neto_a_pagar` coincida con `monto_solicitado`, no una detracción o
 * cálculo tributario real. Cuando se rinde el anticipo (ver
 * liquidarAnticipo) tampoco hay desglose por comprobante todavía — es la
 * siguiente pieza a mejorar si Contabilidad lo necesita.
 */
export async function aprobarPorContabilidad(id: string): Promise<void> {
  const usuario = await exigirUsuario()
  const supabase = crearClienteServidor()

  const { data: solicitud, error } = await supabase
    .schema('gastos')
    .from('solicitudes_gasto')
    .select('id, tipo, solicitante_id, asignado_a, moneda, monto_solicitado, base_imponible, igv, estado')
    .eq('id', id)
    .maybeSingle()
  if (error || !solicitud) throw new Error('No se encontró la solicitud.')
  if (solicitud.estado !== 'pendiente_contabilidad') {
    throw new Error(`La solicitud está en "${solicitud.estado}", no en espera de Contabilidad.`)
  }

  const { baseImponible, igv } =
    solicitud.tipo === 'anticipo'
      ? reversarBaseEIgv(Number(solicitud.monto_solicitado))
      : { baseImponible: Number(solicitud.base_imponible), igv: Number(solicitud.igv) }

  const { data: obligacion, error: errOb } = await supabase
    .schema('cuentas_x_pagar')
    .from('obligaciones')
    .insert({
      origen: solicitud.tipo,
      beneficiario_persona: solicitud.asignado_a ?? solicitud.solicitante_id,
      solicitud_gasto_id: solicitud.id,
      moneda: solicitud.moneda,
      base_imponible: baseImponible,
      igv,
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

/**
 * Sube la foto/PDF real de la factura o boleta al bucket `legajos-gastos`,
 * con el path `<YYYY>/<MM>/<codigo-de-la-solicitud>/<archivo>` que exige
 * `path_legajo_valido()` (migración 0004). Subir el archivo es best-effort:
 * si falla (red, tamaño, tipo no permitido) el comprobante igual se guarda
 * con sus datos — la persona puede reintentar la foto después desde este
 * mismo formulario en el detalle de la solicitud, no se pierde el registro.
 */
export async function subirComprobante(input: {
  solicitudId: string
  fase: 'inicial' | 'rendicion'
  tipoComprobante: 'factura' | 'boleta' | 'sin_comprobante'
  numero?: string | null
  rucEmisor?: string | null
  monto: number
  sustentable: boolean
  archivo?: File | null
}): Promise<void> {
  if (input.monto <= 0) throw new Error('El monto del comprobante tiene que ser mayor a 0.')
  const supabase = crearClienteServidor()

  let storagePath: string | null = null
  if (input.archivo && input.archivo.size > 0) {
    const { data: solicitud } = await supabase
      .schema('gastos')
      .from('solicitudes_gasto')
      .select('codigo')
      .eq('id', input.solicitudId)
      .maybeSingle()
    if (solicitud?.codigo) {
      const ahora = new Date()
      const yyyy = String(ahora.getFullYear())
      const mm = String(ahora.getMonth() + 1).padStart(2, '0')
      const nombreLimpio = input.archivo.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${yyyy}/${mm}/${solicitud.codigo}/${Date.now()}-${nombreLimpio}`
      const { error: errUpload } = await supabase.storage
        .from('legajos-gastos')
        .upload(path, input.archivo, { contentType: input.archivo.type || undefined })
      if (!errUpload) storagePath = path
    }
  }

  const { error } = await supabase.schema('gastos').from('solicitud_comprobantes').insert({
    solicitud_id: input.solicitudId,
    fase: input.fase,
    tipo_comprobante: input.tipoComprobante,
    numero: input.numero ?? null,
    ruc_emisor: input.rucEmisor ?? null,
    monto: input.monto,
    sustentable: input.sustentable,
    storage_path: storagePath,
  })
  if (error) throw new Error(`No se pudo guardar el comprobante: ${error.message}`)
}

/** URL firmada (60s) para ver la foto/PDF de un comprobante ya subido. */
export async function obtenerUrlComprobante(storagePath: string): Promise<string> {
  const supabase = crearClienteServidor()
  const { data, error } = await supabase.storage.from('legajos-gastos').createSignedUrl(storagePath, 60)
  if (error || !data) throw new Error(`No se pudo generar el enlace del comprobante: ${error?.message ?? ''}`)
  return data.signedUrl
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
    .select('id, tipo, estado, moneda, solicitante_id, asignado_a, monto_solicitado, solicitud_comprobantes(fase, monto, sustentable)')
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
    // Mismo artefacto que en aprobarPorContabilidad para un anticipo: los
    // comprobantes de rendición no capturan un desglose base/IGV por línea
    // (solo `monto`), así que no hay nada real que transcribir todavía.
    const montoAdicional = Math.abs(liquidacion.diferencia)
    const { baseImponible, igv } = reversarBaseEIgv(montoAdicional)
    const { data: obligacion, error: errOb } = await supabase
      .schema('cuentas_x_pagar')
      .from('obligaciones')
      .insert({
        origen: 'reembolso',
        beneficiario_persona: solicitud.asignado_a ?? solicitud.solicitante_id,
        solicitud_gasto_id: solicitudId,
        moneda: solicitud.moneda,
        base_imponible: baseImponible,
        igv,
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

/**
 * Desglosa un monto total en base + IGV asumiendo 18% — SOLO para los dos
 * casos donde no existe ningún comprobante real que transcribir (un
 * anticipo antes de rendirse, y el reembolso adicional que sale de rendir
 * comprobantes que no capturan su propio desglose). Para gasto_directo y
 * reembolso normales, `aprobarPorContabilidad()` usa el valor que la
 * persona transcribió de su comprobante — esto NO se usa ahí.
 */
function reversarBaseEIgv(montoTotal: number): { baseImponible: number; igv: number } {
  const baseImponible = Math.round((montoTotal / (1 + TASA_IGV)) * 100) / 100
  const igv = Math.round((montoTotal - baseImponible) * 100) / 100
  return { baseImponible, igv }
}
