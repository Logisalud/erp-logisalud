import 'server-only'
import { crearClienteServidor, exigirUsuario } from '@logisalud/auth/server'
import { baseEIgvMovimiento, type BorradorMovimiento, type EstadoReposicion } from '@/domain/caja-chica'

export type Fondo = {
  id: string
  custodio_id: string
  area: string
  descripcion: string | null
  monto_fijo: number
  moneda: string
  estado: string
}

/** Los fondos donde la persona logueada es custodio — RLS ya filtra el resto. */
export async function listarMisFondos(): Promise<Fondo[]> {
  const usuario = await exigirUsuario()
  const supabase = crearClienteServidor()
  const { data, error } = await supabase
    .schema('caja_chica')
    .from('fondos')
    .select('id, custodio_id, area, descripcion, monto_fijo, moneda, estado')
    .eq('custodio_id', usuario.id)
    .eq('estado', 'activo')
    .order('created_at')
  if (error) throw new Error(`No se pudieron listar tus fondos: ${error.message}`)
  return data ?? []
}

export type BorradorFondo = {
  custodioId: string
  area: string
  montoFijo: number
  moneda: string
  descripcion?: string
}

/** RLS (`fondos_escritura`) ya restringe esto a contabilidad/admin. */
export async function crearFondo(borrador: BorradorFondo): Promise<{ id: string }> {
  const supabase = crearClienteServidor()
  const { data, error } = await supabase
    .schema('caja_chica')
    .from('fondos')
    .insert({
      custodio_id: borrador.custodioId,
      area: borrador.area,
      monto_fijo: borrador.montoFijo,
      moneda: borrador.moneda,
      descripcion: borrador.descripcion ?? null,
    })
    .select('id')
    .single()
  if (error) throw new Error(`No se pudo abrir el fondo: ${error.message}`)
  return data
}

export async function obtenerFondo(id: string): Promise<Fondo | null> {
  const supabase = crearClienteServidor()
  const { data, error } = await supabase
    .schema('caja_chica')
    .from('fondos')
    .select('id, custodio_id, area, descripcion, monto_fijo, moneda, estado')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`No se pudo leer el fondo: ${error.message}`)
  return data
}

export type MovimientoListado = {
  id: string
  fecha: string
  categoria: { nombre: string } | null
  monto: number
  tipo_comprobante: string
  numero: string | null
  sustentable: boolean
  storage_path: string | null
  reposicion_id: string | null
}

/** Movimientos del fondo sin reponer todavía — lo que va a juntar la próxima reposición (regla 13). */
export async function listarMovimientosSinReponer(fondoId: string): Promise<MovimientoListado[]> {
  const supabase = crearClienteServidor()
  const { data, error } = await supabase
    .schema('caja_chica')
    .from('movimientos')
    .select('id, fecha, categoria_id, monto, tipo_comprobante, numero, sustentable, storage_path, reposicion_id')
    .eq('fondo_id', fondoId)
    .is('reposicion_id', null)
    .order('fecha')
  if (error) throw new Error(`No se pudieron listar los movimientos: ${error.message}`)
  return juntarConCategoria(data ?? [])
}

export async function listarMovimientosDeReposicion(reposicionId: string): Promise<MovimientoListado[]> {
  const supabase = crearClienteServidor()
  const { data, error } = await supabase
    .schema('caja_chica')
    .from('movimientos')
    .select('id, fecha, categoria_id, monto, tipo_comprobante, numero, sustentable, storage_path, reposicion_id')
    .eq('reposicion_id', reposicionId)
    .order('fecha')
  if (error) throw new Error(`No se pudieron listar los movimientos: ${error.message}`)
  return juntarConCategoria(data ?? [])
}

async function juntarConCategoria(filas: any[]): Promise<MovimientoListado[]> {
  const supabase = crearClienteServidor()
  const ids = [...new Set(filas.map((f) => f.categoria_id).filter(Boolean))]
  const categorias = ids.length
    ? await supabase.schema('gastos').from('categorias_gasto').select('id, nombre').in('id', ids)
    : { data: [] as any[] }
  const mapa = new Map((categorias.data ?? []).map((c: any) => [c.id, { nombre: c.nombre }]))
  return filas.map((f) => ({ ...f, categoria: mapa.get(f.categoria_id) ?? null }))
}

/**
 * Registra un gasto del fondo. La foto/PDF del comprobante es opcional acá
 * mismo (best-effort, igual que en gastos — ver services/solicitudes-gasto.ts):
 * si falla la subida el movimiento igual queda guardado con sus datos.
 */
export async function registrarMovimiento(
  borrador: BorradorMovimiento,
  archivo?: File | null
): Promise<{ id: string }> {
  const usuario = await exigirUsuario()
  const supabase = crearClienteServidor()
  const { baseImponible, igv } = baseEIgvMovimiento(borrador)

  const { data, error } = await supabase
    .schema('caja_chica')
    .from('movimientos')
    .insert({
      fondo_id: borrador.fondoId,
      fecha: borrador.fecha,
      categoria_id: borrador.categoriaId,
      placa_vehiculo: borrador.placaVehiculo ?? null,
      monto: borrador.monto,
      tipo_comprobante: borrador.tipoComprobante,
      numero: borrador.numero ?? null,
      ruc_emisor: borrador.rucEmisor ?? null,
      sustentable: borrador.sustentable,
      descripcion: borrador.descripcion ?? null,
      base_imponible: borrador.tipoComprobante === 'sin_comprobante' ? null : baseImponible,
      igv: borrador.tipoComprobante === 'sin_comprobante' ? null : igv,
      registrado_por: usuario.id,
    })
    .select('id')
    .single()
  if (error) throw new Error(`No se pudo registrar el movimiento: ${error.message}`)

  if (archivo && archivo.size > 0) {
    const ahora = new Date()
    const yyyy = String(ahora.getFullYear())
    const mm = String(ahora.getMonth() + 1).padStart(2, '0')
    const nombreLimpio = archivo.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${yyyy}/${mm}/movimiento-${data.id}/${Date.now()}-${nombreLimpio}`
    const { error: errUpload } = await supabase.storage
      .from('legajos-caja-chica')
      .upload(path, archivo, { contentType: archivo.type || undefined })
    if (!errUpload) {
      await supabase.schema('caja_chica').from('movimientos').update({ storage_path: path }).eq('id', data.id)
    }
  }

  return data
}

export async function obtenerUrlComprobanteMovimiento(storagePath: string): Promise<string> {
  const supabase = crearClienteServidor()
  const { data, error } = await supabase.storage.from('legajos-caja-chica').createSignedUrl(storagePath, 60)
  if (error || !data) throw new Error(`No se pudo generar el enlace del comprobante: ${error?.message ?? ''}`)
  return data.signedUrl
}

export type ReposicionListada = {
  id: string
  codigo: string
  fondo_id: string
  monto_solicitado: number
  estado: EstadoReposicion
  created_at: string
}

/**
 * Regla 13: junta los movimientos sin `reposicion_id` del fondo, los marca
 * con esta reposición para que no se dupliquen, y arranca el mismo embudo
 * de aprobación que un gasto (jefe de área -> Contabilidad).
 */
export async function crearReposicion(fondoId: string): Promise<{ id: string }> {
  const supabase = crearClienteServidor()

  const { data: movimientos, error: errMov } = await supabase
    .schema('caja_chica')
    .from('movimientos')
    .select('id, monto')
    .eq('fondo_id', fondoId)
    .is('reposicion_id', null)
  if (errMov) throw new Error(`No se pudieron leer los movimientos del fondo: ${errMov.message}`)
  if (!movimientos || movimientos.length === 0) {
    throw new Error('No hay movimientos sin reponer en este fondo todavía.')
  }

  const montoSolicitado = movimientos.reduce((acc, m) => acc + Number(m.monto), 0)

  const { data: reposicion, error: errRep } = await supabase
    .schema('caja_chica')
    .from('reposiciones')
    .insert({ fondo_id: fondoId, monto_solicitado: montoSolicitado })
    .select('id')
    .single()
  if (errRep) throw new Error(`No se pudo crear la reposición: ${errRep.message}`)

  const { error: errLink } = await supabase
    .schema('caja_chica')
    .from('movimientos')
    .update({ reposicion_id: reposicion.id })
    .in('id', movimientos.map((m) => m.id))
  if (errLink) {
    await supabase.schema('caja_chica').from('reposiciones').delete().eq('id', reposicion.id)
    throw new Error(`No se pudieron enlazar los movimientos: ${errLink.message}`)
  }

  return reposicion
}

export async function listarMisReposiciones(): Promise<ReposicionListada[]> {
  const usuario = await exigirUsuario()
  const supabase = crearClienteServidor()
  const { data: fondos } = await supabase.schema('caja_chica').from('fondos').select('id').eq('custodio_id', usuario.id)
  const fondoIds = (fondos ?? []).map((f) => f.id)
  if (fondoIds.length === 0) return []

  const { data, error } = await supabase
    .schema('caja_chica')
    .from('reposiciones')
    .select('id, codigo, fondo_id, monto_solicitado, estado, created_at')
    .in('fondo_id', fondoIds)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`No se pudieron listar tus reposiciones: ${error.message}`)
  return data ?? []
}

/** Bandeja de "esperando una decisión mía ahora" — RLS filtra a jefe de Almacén y Contabilidad. */
export async function listarReposicionesPendientes(): Promise<ReposicionListada[]> {
  const supabase = crearClienteServidor()
  const { data, error } = await supabase
    .schema('caja_chica')
    .from('reposiciones')
    .select('id, codigo, fondo_id, monto_solicitado, estado, created_at')
    .in('estado', ['pendiente_jefe', 'pendiente_contabilidad'])
    .order('created_at')
  if (error) throw new Error(`No se pudieron listar las reposiciones pendientes: ${error.message}`)
  return data ?? []
}

export type ReposicionDetalle = ReposicionListada & {
  fondo: Fondo | null
  movimientos: MovimientoListado[]
}

export async function obtenerReposicion(id: string): Promise<ReposicionDetalle | null> {
  const supabase = crearClienteServidor()
  const { data, error } = await supabase
    .schema('caja_chica')
    .from('reposiciones')
    .select('id, codigo, fondo_id, monto_solicitado, estado, created_at')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`No se pudo leer la reposición: ${error.message}`)
  if (!data) return null

  const [fondo, movimientos] = await Promise.all([obtenerFondo(data.fondo_id), listarMovimientosDeReposicion(id)])
  return { ...data, fondo, movimientos }
}

async function cambiarEstado(id: string, desde: EstadoReposicion[], hacia: EstadoReposicion, campos: Record<string, unknown> = {}) {
  const supabase = crearClienteServidor()
  const { data: reposicion, error } = await supabase.schema('caja_chica').from('reposiciones').select('id, estado').eq('id', id).maybeSingle()
  if (error || !reposicion) throw new Error('No se encontró la reposición.')
  if (!desde.includes(reposicion.estado)) {
    throw new Error(`La reposición está en "${reposicion.estado}" y no se puede mover desde ahí.`)
  }
  const { error: errUpd } = await supabase.schema('caja_chica').from('reposiciones').update({ estado: hacia, ...campos }).eq('id', id)
  if (errUpd) throw new Error(`No se pudo actualizar la reposición: ${errUpd.message}`)
}

/** Un rechazo desenlaza los movimientos: el custodio los recupera para incluirlos en la próxima reposición. */
async function desenlazarMovimientos(reposicionId: string) {
  const supabase = crearClienteServidor()
  await supabase.schema('caja_chica').from('movimientos').update({ reposicion_id: null }).eq('reposicion_id', reposicionId)
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
  await desenlazarMovimientos(id)
}

export async function rechazarPorContabilidad(id: string): Promise<void> {
  const usuario = await exigirUsuario()
  await cambiarEstado(id, ['pendiente_contabilidad'], 'rechazada_contabilidad', {
    aprobado_contabilidad_por: usuario.id, aprobado_contabilidad_fecha: new Date().toISOString(),
  })
  await desenlazarMovimientos(id)
}

/**
 * Regla 6: Contabilidad aprueba y se genera la obligación sola, igual que
 * en gastos. La base/IGV de la obligación es la SUMA real de la base/IGV
 * de cada movimiento ya enlazado — no hay ninguna reconstrucción hacia
 * atrás acá, a diferencia del anticipo de Gastos: cada movimiento con
 * comprobante ya trae su desglose real transcrito al registrarse (ver
 * domain/caja-chica.ts).
 */
export async function aprobarPorContabilidad(id: string): Promise<void> {
  const usuario = await exigirUsuario()
  const supabase = crearClienteServidor()

  const { data: reposicion, error } = await supabase
    .schema('caja_chica')
    .from('reposiciones')
    .select('id, fondo_id, estado')
    .eq('id', id)
    .maybeSingle()
  if (error || !reposicion) throw new Error('No se encontró la reposición.')
  if (reposicion.estado !== 'pendiente_contabilidad') {
    throw new Error(`La reposición está en "${reposicion.estado}", no en espera de Contabilidad.`)
  }

  const fondo = await obtenerFondo(reposicion.fondo_id)
  if (!fondo) throw new Error('No se encontró el fondo de esta reposición.')

  const { data: movimientosConDesglose, error: errMov } = await supabase
    .schema('caja_chica')
    .from('movimientos')
    .select('base_imponible, igv, monto')
    .eq('reposicion_id', id)
  if (errMov) throw new Error(`No se pudieron leer los movimientos: ${errMov.message}`)

  const baseImponible = (movimientosConDesglose ?? []).reduce(
    (acc, m) => acc + Number(m.base_imponible ?? m.monto), 0
  )
  const igv = (movimientosConDesglose ?? []).reduce((acc, m) => acc + Number(m.igv ?? 0), 0)

  const { data: obligacion, error: errOb } = await supabase
    .schema('cuentas_x_pagar')
    .from('obligaciones')
    .insert({
      origen: 'reposicion_caja_chica',
      beneficiario_persona: fondo.custodio_id,
      reposicion_caja_chica_id: id,
      moneda: fondo.moneda,
      base_imponible: baseImponible,
      igv,
      estado: 'registrada',
      created_by: usuario.id,
    })
    .select('id')
    .single()
  if (errOb) throw new Error(`No se pudo generar la obligación: ${errOb.message}`)

  const { error: errUpd } = await supabase
    .schema('caja_chica')
    .from('reposiciones')
    .update({
      estado: 'aprobada',
      aprobado_contabilidad_por: usuario.id,
      aprobado_contabilidad_fecha: new Date().toISOString(),
      obligacion_id: obligacion.id,
    })
    .eq('id', id)
  if (errUpd) throw new Error(`La obligación se creó pero no se pudo actualizar la reposición: ${errUpd.message}`)
}

/**
 * Se llama desde services/pagos.ts justo después de marcar 'pagada' una
 * obligación con `reposicion_caja_chica_id` — a diferencia de un anticipo de
 * Gastos, acá no hay rendición posterior (los comprobantes ya existían
 * antes de pedir la reposición), así que el ciclo se cierra directo, mismo
 * patrón que gasto_directo/reembolso (ver estadoTrasPago en domain/gasto.ts).
 */
export async function marcarReposicionPagada(obligacionId: string): Promise<void> {
  const supabase = crearClienteServidor()
  const { data: reposicion } = await supabase
    .schema('caja_chica')
    .from('reposiciones')
    .select('id, estado')
    .eq('obligacion_id', obligacionId)
    .maybeSingle()
  if (!reposicion || reposicion.estado !== 'aprobada') return

  await supabase.schema('caja_chica').from('reposiciones').update({ estado: 'cerrada' }).eq('id', reposicion.id)
}
