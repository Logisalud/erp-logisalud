import 'server-only'
import { crearClienteServidor, exigirUsuario, perfilActual } from '@logisalud/auth/server'
import {
  descripcionDeObligacion, puedeCargarPlanilla, puedeCorregirse,
  puedeDarConformidadPlanilla, puedeDarseConformidad, validarPagoPlanilla,
  type BorradorPagoPlanilla, type EstadoPagoPlanilla,
} from '@/domain/planilla'

/**
 * Pago de Planilla — carga de Gestión Humana, conformidad de
 * Contabilidad/Tesorería, y de ahí al embudo normal de Cuentas por Pagar.
 *
 * El gate va en el servicio ADEMÁS de en la policy RLS, a propósito: tres de
 * las cuatro Server Actions de aprobación del módulo confían solo en la RLS
 * (ver el pendiente prioritario de CONTEXTO.md), y esto no nace con ese
 * agujero.
 */

export type PagoPlanillaListado = {
  id: string
  codigo: string
  periodo: string
  secuencia: number
  monto: number
  moneda: string
  fecha_pago: string
  estado: EstadoPagoPlanilla
  cargadoPor: string | null
  obligacion_id: string | null
  anulado_en: string | null
  anulado_motivo: string | null
  /** El estado de la obligación que generó, si ya la generó. Deja ver desde
   * acá si la planilla del mes ya se pagó, sin tener que ir a Cuentas por
   * Pagar. No hay un `marcarPlanillaPagada` como en Impuestos o Servicios
   * porque acá no hay ciclo propio que cerrar: la carga termina cuando nace
   * la obligación, y de ahí en adelante manda la obligación. */
  estadoObligacion: string | null
}

export async function crearPagoPlanilla(
  borrador: BorradorPagoPlanilla
): Promise<{ id: string; codigo: string }> {
  if (!puedeCargarPlanilla(await perfilActual())) {
    throw new Error('Solo Gestión Humana, Contabilidad o Administración pueden cargar la planilla.')
  }
  const errores = validarPagoPlanilla(borrador)
  if (errores.length > 0) throw new Error(errores[0].mensaje)

  const usuario = await exigirUsuario()
  const supabase = crearClienteServidor()

  const { data, error } = await supabase
    .schema('planilla')
    .from('pagos_planilla')
    .insert({
      periodo: borrador.periodo,
      secuencia: borrador.secuencia,
      monto: borrador.monto,
      moneda: borrador.moneda,
      fecha_pago: borrador.fechaPago,
      cargado_por: usuario.id,
    })
    .select('id, codigo')
    .single()

  if (error) {
    // El índice único parcial (periodo, secuencia) es la única defensa real
    // contra cargar dos veces la misma quincena — un chequeo previo pierde
    // contra dos pestañas abiertas. Acá solo se traduce a algo legible.
    if (error.code === '23505') {
      throw new Error(
        'Ya hay un pago cargado para ese periodo y esa quincena. Si el anterior está mal, anúlalo primero.'
      )
    }
    throw new Error(`No se pudo cargar el pago de planilla: ${error.message}`)
  }
  return data
}

/**
 * Contabilidad o Tesorería confirman, y ahí nace la obligación — mismo
 * patrón que `confirmarObligacionTributaria`.
 *
 * `fecha_pago` va como `fecha_vencimiento_real`: es un compromiso duro, no
 * una estimación, así que tiene que entrar en la sección "Vencidas" de la
 * propuesta y en la proyección de pagos como cualquier otro vencimiento.
 *
 * Sin transacción, como todo el módulo: si el update falla después del
 * insert, queda una obligación sin su carga apuntada. El mensaje de error
 * lo dice en vez de fingir que no pasó nada.
 */
export async function darConformidadPlanilla(id: string): Promise<void> {
  const perfil = await perfilActual()
  if (!puedeDarConformidadPlanilla(perfil)) {
    throw new Error('Solo Contabilidad (rol admin), Tesorería o Administración pueden dar conformidad.')
  }
  const usuario = await exigirUsuario()
  const supabase = crearClienteServidor()

  const { data: pago, error } = await supabase
    .schema('planilla')
    .from('pagos_planilla')
    .select('id, periodo, secuencia, monto, moneda, fecha_pago, estado')
    .eq('id', id)
    .maybeSingle()
  if (error || !pago) throw new Error('No se encontró el pago de planilla.')
  if (!puedeDarseConformidad(pago.estado as EstadoPagoPlanilla)) {
    throw new Error(`Este pago está en "${pago.estado}", no en espera de conformidad.`)
  }

  const { data: obligacion, error: errOb } = await supabase
    .schema('cuentas_x_pagar')
    .from('obligaciones')
    .insert({
      origen: 'planilla',
      moneda: pago.moneda,
      // La planilla no tiene IGV: son remuneraciones, no una compra.
      base_imponible: pago.monto,
      igv: 0,
      estado: 'registrada',
      fecha_vencimiento_real: pago.fecha_pago,
      observaciones: descripcionDeObligacion(pago.periodo, pago.secuencia),
      created_by: usuario.id,
      creador_correo: usuario.email ?? null,
    })
    .select('id')
    .single()
  if (errOb) throw new Error(`No se pudo generar la obligación: ${errOb.message}`)

  const { error: errUpd } = await supabase
    .schema('planilla')
    .from('pagos_planilla')
    .update({ estado: 'conforme', obligacion_id: obligacion.id })
    .eq('id', id)
  if (errUpd) {
    throw new Error(
      `La obligación se creó pero no se pudo marcar el pago como conforme: ${errUpd.message}`
    )
  }
}

/** Corregir un monto mal transcrito, antes de que genere obligación. */
export async function editarPagoPlanilla(
  id: string,
  borrador: BorradorPagoPlanilla
): Promise<void> {
  if (!puedeCargarPlanilla(await perfilActual())) {
    throw new Error('No tienes permiso para corregir la planilla.')
  }
  const errores = validarPagoPlanilla(borrador)
  if (errores.length > 0) throw new Error(errores[0].mensaje)

  const supabase = crearClienteServidor()
  const { data: actual } = await supabase
    .schema('planilla')
    .from('pagos_planilla')
    .select('id, estado')
    .eq('id', id)
    .maybeSingle()
  if (!actual) throw new Error('No se encontró el pago de planilla.')
  if (!puedeCorregirse(actual.estado as EstadoPagoPlanilla)) {
    throw new Error(
      'Este pago ya generó su obligación — para corregirlo hay que anular la obligación desde Cuentas por Pagar.'
    )
  }

  const { error } = await supabase
    .schema('planilla')
    .from('pagos_planilla')
    .update({
      periodo: borrador.periodo,
      secuencia: borrador.secuencia,
      monto: borrador.monto,
      moneda: borrador.moneda,
      fecha_pago: borrador.fechaPago,
    })
    .eq('id', id)
  if (error) {
    if (error.code === '23505') {
      throw new Error('Ya hay otro pago cargado para ese periodo y esa quincena.')
    }
    throw new Error(`No se pudo guardar: ${error.message}`)
  }
}

/**
 * Contabilidad devuelve una carga de planilla. (Sebas, 2026-09-19.)
 *
 * Distinto de anular, aunque las dos dejen el registro muerto:
 *
 *   ANULAR    Gestión Humana se equivocó al cargar y lo retira. El gate es
 *             `puedeCargarPlanilla` — quien carga corrige lo suyo.
 *   RECHAZAR  Contabilidad revisó el total y decide que no procede. El gate
 *             es el mismo que dar conformidad: si podés decir que sí,
 *             podés decir que no.
 *
 * Misma ventana que la conformidad: solo `pendiente_contabilidad`. Después
 * ya hay una obligación en camino a pagarse y eso se anula desde su ficha.
 */
export async function rechazarPagoPlanilla(id: string, motivo: string): Promise<void> {
  if (!puedeDarConformidadPlanilla(await perfilActual())) {
    throw new Error('No tienes permiso para rechazar una carga de planilla.')
  }
  if (!motivo.trim()) throw new Error('El motivo del rechazo es obligatorio.')
  const usuario = await exigirUsuario()
  const supabase = crearClienteServidor()

  const { data: actual } = await supabase
    .schema('planilla')
    .from('pagos_planilla')
    .select('id, estado')
    .eq('id', id)
    .maybeSingle()
  if (!actual) throw new Error('No se encontró el pago de planilla.')
  if (!puedeCorregirse(actual.estado as EstadoPagoPlanilla)) {
    throw new Error('Este pago ya generó su obligación — rechazarlo ahora no la deshace.')
  }

  const { error } = await supabase
    .schema('planilla')
    .from('pagos_planilla')
    .update({
      estado: 'rechazada',
      rechazado_por: usuario.id,
      rechazado_en: new Date().toISOString(),
      rechazo_motivo: motivo.trim(),
    })
    .eq('id', id)
  if (error) throw new Error(`No se pudo rechazar la carga: ${error.message}`)
}

/** Anular libera el par (periodo, secuencia) — el índice único es parcial a
 * propósito, para que un error de tipeo no bloquee el periodo para siempre. */
export async function anularPagoPlanilla(id: string, motivo: string): Promise<void> {
  if (!puedeCargarPlanilla(await perfilActual())) {
    throw new Error('No tienes permiso para anular una carga de planilla.')
  }
  if (!motivo.trim()) throw new Error('El motivo de la anulación es obligatorio.')
  const usuario = await exigirUsuario()
  const supabase = crearClienteServidor()

  const { data: actual } = await supabase
    .schema('planilla')
    .from('pagos_planilla')
    .select('id, estado')
    .eq('id', id)
    .maybeSingle()
  if (!actual) throw new Error('No se encontró el pago de planilla.')
  if (!puedeCorregirse(actual.estado as EstadoPagoPlanilla)) {
    throw new Error(
      'Este pago ya generó su obligación — anúlala desde Cuentas por Pagar, no desde aquí.'
    )
  }

  const { error } = await supabase
    .schema('planilla')
    .from('pagos_planilla')
    .update({
      estado: 'anulada',
      anulado_por: usuario.id,
      anulado_en: new Date().toISOString(),
      anulado_motivo: motivo.trim(),
    })
    .eq('id', id)
  if (error) throw new Error(`No se pudo anular: ${error.message}`)
}

export async function listarPagosPlanilla(): Promise<PagoPlanillaListado[]> {
  const supabase = crearClienteServidor()
  const { data, error } = await supabase
    .schema('planilla')
    .from('pagos_planilla')
    .select(`id, codigo, periodo, secuencia, monto, moneda, fecha_pago, estado,
             cargado_por, obligacion_id, anulado_en, anulado_motivo`)
    .order('periodo', { ascending: false })
    .order('secuencia', { ascending: false })
    .limit(200)
  if (error) throw new Error(`No se pudieron listar los pagos de planilla: ${error.message}`)

  const filas = data ?? []
  if (filas.length === 0) return []

  // PostgREST no embebe entre schemas (`planilla` → `public`), así que el
  // nombre de quien cargó se cruza en JS — mismo patrón del resto del módulo.
  const ids = [...new Set(filas.map((f: any) => f.cargado_por).filter(Boolean))] as string[]
  const personas = new Map<string, string>()
  if (ids.length > 0) {
    const { data: perfiles } = await supabase.from('perfiles').select('id, nombre').in('id', ids)
    for (const p of (perfiles ?? []) as any[]) personas.set(p.id, p.nombre)
  }

  const idsObligacion = [...new Set(filas.map((f: any) => f.obligacion_id).filter(Boolean))] as string[]
  const estadosObligacion = new Map<string, string>()
  if (idsObligacion.length > 0) {
    const { data: obs } = await supabase
      .schema('cuentas_x_pagar')
      .from('obligaciones')
      .select('id, estado')
      .in('id', idsObligacion)
    for (const o of (obs ?? []) as any[]) estadosObligacion.set(o.id, o.estado)
  }

  return filas.map((f: any) => ({
    id: f.id,
    codigo: f.codigo,
    periodo: f.periodo,
    secuencia: f.secuencia,
    monto: Number(f.monto),
    moneda: f.moneda,
    fecha_pago: f.fecha_pago,
    estado: f.estado as EstadoPagoPlanilla,
    cargadoPor: f.cargado_por ? personas.get(f.cargado_por) ?? null : null,
    obligacion_id: f.obligacion_id ?? null,
    anulado_en: f.anulado_en ?? null,
    anulado_motivo: f.anulado_motivo ?? null,
    estadoObligacion: f.obligacion_id ? estadosObligacion.get(f.obligacion_id) ?? null : null,
  }))
}

export async function obtenerPagoPlanilla(id: string): Promise<PagoPlanillaListado | null> {
  const todos = await listarPagosPlanilla()
  return todos.find((p) => p.id === id) ?? null
}
