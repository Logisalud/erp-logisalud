import 'server-only'
import { crearClienteServidor, exigirUsuario, perfilActual } from '@logisalud/auth/server'
import { baseEIgvMovimiento, type BorradorMovimiento, type EstadoReposicion } from '@/domain/caja-chica'
import { ERROR_AUTO_APROBACION, puedeDecidirSobre } from '@/domain/auto-aprobacion'
import { anioMesStorageLima } from '@/domain/fecha'

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
    const nombreLimpio = archivo.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${anioMesStorageLima()}/movimiento-${data.id}/${Date.now()}-${nombreLimpio}`
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

/**
 * Pieza H: el custodio del fondo es quien PIDE la reposición, así que no
 * puede ser quien la aprueba. Se chequea acá porque el flag
 * `acceso_abierto_temporal` anula hoy las policies (ver
 * domain/auto-aprobacion.ts).
 */
async function exigirQueNoSeaSuPropiaReposicion(id: string, usuarioId: string): Promise<void> {
  const supabase = crearClienteServidor()
  const { data: reposicion } = await supabase
    .schema('caja_chica')
    .from('reposiciones')
    .select('fondo_id')
    .eq('id', id)
    .maybeSingle()
  if (!reposicion) return
  const { data: fondo } = await supabase
    .schema('caja_chica')
    .from('fondos')
    .select('custodio_id')
    .eq('id', (reposicion as any).fondo_id)
    .maybeSingle()
  if (!puedeDecidirSobre(await perfilActual(), usuarioId, (fondo as any)?.custodio_id ?? null)) {
    throw new Error(ERROR_AUTO_APROBACION)
  }
}

export async function aprobarPorJefe(id: string): Promise<void> {
  const usuario = await exigirUsuario()
  await exigirQueNoSeaSuPropiaReposicion(id, usuario.id)
  await cambiarEstado(id, ['pendiente_jefe'], 'pendiente_contabilidad', {
    aprobado_jefe_por: usuario.id, aprobado_jefe_fecha: new Date().toISOString(),
  })
}

export async function rechazarPorJefe(id: string): Promise<void> {
  const usuario = await exigirUsuario()
  await exigirQueNoSeaSuPropiaReposicion(id, usuario.id)
  await cambiarEstado(id, ['pendiente_jefe'], 'rechazada_jefe', {
    aprobado_jefe_por: usuario.id, aprobado_jefe_fecha: new Date().toISOString(),
  })
  await desenlazarMovimientos(id)
}

export async function rechazarPorContabilidad(id: string): Promise<void> {
  const usuario = await exigirUsuario()
  await exigirQueNoSeaSuPropiaReposicion(id, usuario.id)
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
  await exigirQueNoSeaSuPropiaReposicion(id, usuario.id)
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

/**
 * Carga una rendición entera desde el Excel de Roberto: N movimientos + la
 * reposición que los agrupa, en una sola operación.
 *
 * NO reimplementa nada: los movimientos se insertan en la misma tabla y con
 * la misma forma que `registrarMovimiento`, y la reposición la crea
 * `crearReposicion`, que es la misma función del botón "Pedir reposición".
 * Por eso la rendición cargada por Excel entra al embudo normal —jefe de
 * área, después Contabilidad— y aparece sola en "Pendientes de aprobar", sin
 * una línea de código nueva en esa pantalla.
 *
 * DECISIÓN CONSCIENTE sobre base e IGV: las filas entran como
 * `sin_comprobante`, con base e igv en null. El Excel trae una sola columna
 * de dinero y Sebas decidió (2026-09-16) no pedirle a Roberto que agregue el
 * desglose. Se pierde el crédito fiscal —del orden de S/95 por rendición— a
 * cambio de que él no cambie su planilla. Ver lib/excel-caja-chica.ts.
 *
 * Sin transacción, como todo el módulo: si algo falla después de insertar
 * los movimientos, quedan en el fondo SIN reposición — que es exactamente el
 * mismo estado en que los deja la carga de a uno, así que no hay nada
 * inconsistente que limpiar. Se pueden reponer después con el botón normal.
 */
export async function cargarRendicionDesdeExcel(input: {
  fondoId: string
  filas: readonly {
    fecha: string
    placaVehiculo: string
    categoriaNombre: string
    descripcion: string
    numero: string
    monto: number
  }[]
  /** El .xlsx ya subido, en su propio request. Ver la Server Action. */
  storagePathExcel: string | null
}): Promise<{ reposicionId: string; movimientos: number }> {
  const usuario = await exigirUsuario()
  const supabase = crearClienteServidor()

  if (input.filas.length === 0) throw new Error('La rendición no tiene ninguna fila.')

  // Los nombres de categoría del Excel ya vienen mapeados al catálogo por el
  // parser; acá se resuelven a id contra la BASE, nunca confiando en un id
  // que venga del navegador.
  const nombres = [...new Set(input.filas.map((f) => f.categoriaNombre))]
  const { data: categorias, error: errCat } = await supabase
    .schema('gastos')
    .from('categorias_gasto')
    .select('id, nombre')
    .in('nombre', nombres)
  if (errCat) throw new Error(`No se pudieron leer las categorías: ${errCat.message}`)

  const idPorNombre = new Map((categorias ?? []).map((c: any) => [c.nombre, c.id]))
  const sinMapear = nombres.filter((n) => !idPorNombre.has(n))
  if (sinMapear.length > 0) {
    throw new Error(`Estas categorías no existen en el catálogo: ${sinMapear.join(', ')}.`)
  }

  const { error: errIns } = await supabase
    .schema('caja_chica')
    .from('movimientos')
    .insert(input.filas.map((f) => ({
      fondo_id: input.fondoId,
      fecha: f.fecha,
      categoria_id: idPorNombre.get(f.categoriaNombre),
      placa_vehiculo: f.placaVehiculo || null,
      monto: f.monto,
      // Ver el comentario de arriba: sin desglose, y `sin_comprobante` es la
      // única combinación que el CHECK permite sin inventar base e IGV.
      tipo_comprobante: 'sin_comprobante',
      base_imponible: null,
      igv: null,
      numero: f.numero || null,
      descripcion: f.descripcion || null,
      registrado_por: usuario.id,
    })))
  if (errIns) throw new Error(`No se pudieron cargar los movimientos: ${errIns.message}`)

  const reposicion = await crearReposicion(input.fondoId)

  if (input.storagePathExcel) {
    // Best-effort, igual que el resto de los adjuntos del módulo: la
    // rendición ya está cargada y no se pierde por no poder anotar el path.
    await supabase
      .schema('caja_chica')
      .from('reposiciones')
      .update({ storage_path_excel: input.storagePathExcel })
      .eq('id', reposicion.id)
  }

  return { reposicionId: reposicion.id, movimientos: input.filas.length }
}

/** Sube el .xlsx de la rendición. En su PROPIO request: junto con las filas
 *  podría pasar el límite de body de una Server Action, que es el fallo
 *  silencioso del "botón que no hacía nada". */
export async function subirExcelRendicion(
  fondoId: string,
  archivo: File
): Promise<{ path: string } | { error: string }> {
  if (!archivo || archivo.size === 0) return { error: 'El archivo está vacío.' }
  const supabase = crearClienteServidor()
  const nombreLimpio = archivo.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${anioMesStorageLima()}/rendicion-${fondoId}/${Date.now()}-${nombreLimpio}`
  const { error } = await supabase.storage
    .from('legajos-caja-chica')
    .upload(path, archivo, { contentType: archivo.type || undefined })
  if (error) {
    console.error('[subirExcelRendicion]', error.message)
    return { error: `No se pudo subir el Excel: ${error.message}` }
  }
  return { path }
}
