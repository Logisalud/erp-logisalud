import 'server-only'
import { crearClienteServidor, exigirUsuario, perfilActual } from '@logisalud/auth/server'
import {
  validarAporte, validarAportes, type BorradorAporte,
} from '@/domain/aporte-accionista'
import { anioMesStorageLima } from '@/domain/fecha'

/**
 * Aportes de accionista — registro informativo, SIN obligación de pago.
 *
 * Este servicio NUNCA escribe en `cuentas_x_pagar.obligaciones`, y esa es su
 * regla más importante. Si alguna vez hace falta que un aporte genere una
 * deuda, deja de ser un aporte: es un reembolso, y ese flujo ya existe.
 */

export type AporteListado = {
  id: string
  codigo: string
  fecha: string
  categoria: string
  descripcion: string
  moneda: string
  monto: number
  storage_path_comprobante: string | null
  registradoPor: string | null
  anulado_en: string | null
  anulado_motivo: string | null
  editadoPor: string | null
  editado_en: string | null
}

/**
 * Quién puede REGISTRAR un aporte: `area = 'admin'` y `rol = 'admin'` — hoy,
 * Sebastián Gonzales y Andrés Romero.
 *
 * Es el mismo criterio que la policy RLS `aportes_accionista_escritura`, a
 * propósito duplicado acá: tres de las cuatro Server Actions de aprobación
 * del módulo no chequean permiso en el servidor y confían solo en la RLS
 * (ver el pendiente prioritario de CONTEXTO.md). Esta no nace con ese
 * agujero — el gate va en las dos capas.
 *
 * NO es `esAutoridadFinal`: esa incluye contabilidad rol admin (Mariela),
 * que puede LEER el reporte pero no registrar.
 */
export function puedeRegistrarAporte(
  perfil: { area: string | null; rol: string | null } | null
): boolean {
  return perfil?.area === 'admin' && perfil?.rol === 'admin'
}

/** Contabilidad lee el reporte; quien registra también ve lo suyo. */
export function puedeVerAportes(
  perfil: { area: string | null; rol: string | null } | null
): boolean {
  return puedeRegistrarAporte(perfil) || perfil?.area === 'contabilidad'
}

async function exigirPermisoDeEscritura(): Promise<void> {
  const perfil = await perfilActual()
  if (!puedeRegistrarAporte(perfil)) {
    throw new Error('Solo Gerencia puede registrar un aporte de accionista.')
  }
}

export async function crearAporte(borrador: BorradorAporte): Promise<{ id: string; codigo: string }> {
  await exigirPermisoDeEscritura()
  const usuario = await exigirUsuario()
  const supabase = crearClienteServidor()

  const errores = validarAporte(borrador)
  if (errores.length > 0) throw new Error(errores[0].mensaje)

  const { data, error } = await supabase
    .schema('gastos')
    .from('aportes_accionista')
    .insert({
      fecha: borrador.fecha,
      categoria_id: borrador.categoriaId || null,
      categoria_libre: borrador.categoriaId ? null : borrador.categoriaLibre?.trim() || null,
      descripcion: borrador.descripcion.trim(),
      moneda: borrador.moneda,
      monto: borrador.monto,
      registrado_por: usuario.id,
    })
    .select('id, codigo')
    .single()
  if (error) throw new Error(`No se pudo registrar el aporte: ${error.message}`)
  return data
}

/**
 * Carga N aportes en un solo envío — todo o nada.
 *
 * Un único `.insert([...])`: es UNA sentencia, así que o entran las N filas
 * o no entra ninguna. N llamadas separadas no serían atómicas y el módulo no
 * usa transacciones, así que un fallo en la cuarta dejaría las tres primeras
 * cargadas sin forma de revertirlas.
 *
 * Los comprobantes NO se suben acá: ya vienen subidos, cada uno en su propio
 * request, y lo que llega es la ruta. Eso es lo que evita que el envío se
 * pase del límite de body: con 4 fotos de celular adjuntas, un submit que
 * las llevara todas juntas rondaría los 10 MB y lo rechazaría la
 * infraestructura ANTES de ejecutar nada — el mismo fallo silencioso que ya
 * arreglamos una vez (ver components/campo-archivo.tsx).
 */
export async function crearAportesEnLote(
  lineas: readonly (BorradorAporte & { storagePathComprobante?: string | null })[]
): Promise<{ cantidad: number }> {
  await exigirPermisoDeEscritura()
  const errores = validarAportes(lineas)
  if (errores.length > 0) throw new Error(errores[0].mensaje)

  const usuario = await exigirUsuario()
  const supabase = crearClienteServidor()

  const { data, error } = await supabase
    .schema('gastos')
    .from('aportes_accionista')
    .insert(
      lineas.map((l) => ({
        fecha: l.fecha,
        categoria_id: l.categoriaId || null,
        categoria_libre: l.categoriaId ? null : l.categoriaLibre?.trim() || null,
        descripcion: l.descripcion.trim(),
        moneda: l.moneda,
        monto: l.monto,
        storage_path_comprobante: l.storagePathComprobante || null,
        registrado_por: usuario.id,
      }))
    )
    .select('id')
  if (error) throw new Error(`No se pudieron registrar los aportes: ${error.message}`)
  return { cantidad: (data ?? []).length }
}

/**
 * Sube UN comprobante suelto, apenas se elige el archivo y antes de que
 * exista la fila.
 *
 * EL PATH TIENE QUE SER `YYYY/MM/<algo>/<archivo>`: la policy de Storage
 * `legajos_gastos_escritura` exige `path_legajo_valido(name)`, que valida
 * exactamente ese formato. Un `borradores/<uuid>/...` es rechazado por RLS
 * — fue el primer intento y fallaba en silencio. Por eso el prefijo de
 * borrador va en el TERCER segmento (`borradores-<uuid>`), que es libre.
 *
 * Si la persona abandona el formulario, el archivo queda huérfano: es el
 * costo aceptado de no mandar N archivos en un mismo request (ver
 * CONTEXTO.md). Son archivos chicos en un bucket privado e invisibles.
 *
 * Devuelve el motivo cuando falla, en vez de un null mudo: el comprobante es
 * opcional, pero "no se pudo" sin decir por qué deja a la persona sin nada
 * que hacer.
 */
export type ResultadoSubida = { path: string } | { error: string }

export async function subirComprobanteSuelto(archivo: File): Promise<ResultadoSubida> {
  await exigirPermisoDeEscritura()
  if (archivo.size === 0) return { error: 'El archivo está vacío.' }
  const supabase = crearClienteServidor()

  const nombreLimpio = archivo.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${anioMesStorageLima()}/borradores-${crypto.randomUUID()}/${nombreLimpio}`

  const { error } = await supabase.storage
    .from('legajos-gastos')
    .upload(path, archivo, { contentType: archivo.type || undefined })
  if (error) {
    console.error('[subirComprobanteSuelto] falló la subida:', error.message)
    return { error: `No se pudo subir: ${error.message}` }
  }
  return { path }
}

export async function editarAporte(id: string, borrador: BorradorAporte): Promise<void> {
  await exigirPermisoDeEscritura()
  const usuario = await exigirUsuario()
  const supabase = crearClienteServidor()

  const errores = validarAporte(borrador)
  if (errores.length > 0) throw new Error(errores[0].mensaje)

  const { data: actual } = await supabase
    .schema('gastos')
    .from('aportes_accionista')
    .select('id, anulado_en')
    .eq('id', id)
    .maybeSingle()
  if (!actual) throw new Error('No se encontró el aporte.')
  if (actual.anulado_en) throw new Error('Este aporte está anulado — ya no se edita.')

  const { error } = await supabase
    .schema('gastos')
    .from('aportes_accionista')
    .update({
      fecha: borrador.fecha,
      categoria_id: borrador.categoriaId || null,
      categoria_libre: borrador.categoriaId ? null : borrador.categoriaLibre?.trim() || null,
      descripcion: borrador.descripcion.trim(),
      moneda: borrador.moneda,
      monto: borrador.monto,
      editado_por: usuario.id,
      editado_en: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw new Error(`No se pudo guardar la edición: ${error.message}`)
}

/** Anular es borrado LÓGICO: Contabilidad ya pudo haberlo asentado, y una
 * fila que desaparece sin rastro es lo que rompe una conciliación. */
export async function anularAporte(id: string, motivo: string): Promise<void> {
  await exigirPermisoDeEscritura()
  if (!motivo.trim()) throw new Error('El motivo de la anulación es obligatorio.')
  const usuario = await exigirUsuario()
  const supabase = crearClienteServidor()

  const { data: actual } = await supabase
    .schema('gastos')
    .from('aportes_accionista')
    .select('id, anulado_en')
    .eq('id', id)
    .maybeSingle()
  if (!actual) throw new Error('No se encontró el aporte.')
  if (actual.anulado_en) throw new Error('Este aporte ya está anulado.')

  const { error } = await supabase
    .schema('gastos')
    .from('aportes_accionista')
    .update({
      anulado_por: usuario.id,
      anulado_en: new Date().toISOString(),
      anulado_motivo: motivo.trim(),
    })
    .eq('id', id)
  if (error) throw new Error(`No se pudo anular: ${error.message}`)
}

export type FiltrosAportes = { desde?: string; hasta?: string; incluirAnulados?: boolean }

export async function listarAportes(filtros: FiltrosAportes = {}): Promise<AporteListado[]> {
  const supabase = crearClienteServidor()
  let q = supabase
    .schema('gastos')
    .from('aportes_accionista')
    .select(`id, codigo, fecha, categoria_id, categoria_libre, descripcion, moneda, monto,
             storage_path_comprobante, registrado_por, anulado_en, anulado_motivo,
             editado_por, editado_en`)
    .order('fecha', { ascending: false })
    .limit(500)

  if (filtros.desde) q = q.gte('fecha', filtros.desde)
  if (filtros.hasta) q = q.lte('fecha', filtros.hasta)
  // Lo anulado no es trabajo ni es costo: por defecto no ensucia el reporte.
  if (!filtros.incluirAnulados) q = q.is('anulado_en', null)

  const { data, error } = await q
  if (error) throw new Error(`No se pudieron listar los aportes: ${error.message}`)
  return armarFilas(data ?? [])
}

/** Un aporte, con la MISMA forma que las filas del listado — mismo armador,
 * para que la ficha y el listado nunca muestren cosas distintas. */
export async function obtenerAporte(id: string): Promise<AporteListado | null> {
  const supabase = crearClienteServidor()
  const { data, error } = await supabase
    .schema('gastos')
    .from('aportes_accionista')
    .select(`id, codigo, fecha, categoria_id, categoria_libre, descripcion, moneda, monto,
             storage_path_comprobante, registrado_por, anulado_en, anulado_motivo,
             editado_por, editado_en`)
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`No se pudo leer el aporte: ${error.message}`)
  if (!data) return null
  return (await armarFilas([data]))[0] ?? null
}

/** El cruce de categoría y personas, en un solo lugar: lo comparten el
 * listado y la ficha. */
async function armarFilas(filas: any[]): Promise<AporteListado[]> {
  if (filas.length === 0) return []
  // PostgREST no embebe entre schemas (`gastos` → `public`), así que el join
  // va en JS con un Map — mismo patrón que el resto del módulo.
  const [categorias, personas] = await Promise.all([
    mapaCategorias([...new Set(filas.map((f) => f.categoria_id).filter(Boolean))] as string[]),
    mapaPersonas([
      ...new Set(filas.flatMap((f) => [f.registrado_por, f.editado_por]).filter(Boolean)),
    ] as string[]),
  ])

  return filas.map((f) => ({
    id: f.id,
    codigo: f.codigo,
    fecha: f.fecha,
    categoria: categorias.get(f.categoria_id ?? '') ?? f.categoria_libre?.trim() ?? '—',
    descripcion: f.descripcion,
    moneda: f.moneda,
    monto: Number(f.monto),
    storage_path_comprobante: f.storage_path_comprobante ?? null,
    registradoPor: personas.get(f.registrado_por) ?? null,
    anulado_en: f.anulado_en ?? null,
    anulado_motivo: f.anulado_motivo ?? null,
    editadoPor: f.editado_por ? personas.get(f.editado_por) ?? null : null,
    editado_en: f.editado_en ?? null,
  }))
}

/** El comprobante es opcional y best-effort, igual que el resto de los
 * adjuntos del módulo: si falla la subida, el aporte ya quedó registrado. */
export async function subirComprobanteAporte(aporteId: string, archivo: File): Promise<boolean> {
  if (archivo.size === 0) return false
  const supabase = crearClienteServidor()

  const { data: aporte } = await supabase
    .schema('gastos')
    .from('aportes_accionista')
    .select('codigo')
    .eq('id', aporteId)
    .maybeSingle()
  if (!aporte?.codigo) return false

  const nombreLimpio = archivo.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${anioMesStorageLima()}/${aporte.codigo}/${Date.now()}-${nombreLimpio}`

  const { error: errUpload } = await supabase.storage
    .from('legajos-gastos')
    .upload(path, archivo, { contentType: archivo.type || undefined })
  if (errUpload) return false

  const { error: errUpd } = await supabase
    .schema('gastos')
    .from('aportes_accionista')
    .update({ storage_path_comprobante: path })
    .eq('id', aporteId)
  return !errUpd
}

async function mapaCategorias(ids: string[]): Promise<Map<string, string>> {
  const mapa = new Map<string, string>()
  if (ids.length === 0) return mapa
  const supabase = crearClienteServidor()
  const { data } = await supabase.schema('gastos').from('categorias_gasto').select('id, nombre').in('id', ids)
  for (const c of (data ?? []) as any[]) mapa.set(c.id, c.nombre)
  return mapa
}

async function mapaPersonas(ids: string[]): Promise<Map<string, string>> {
  const mapa = new Map<string, string>()
  if (ids.length === 0) return mapa
  const supabase = crearClienteServidor()
  const { data } = await supabase.from('perfiles').select('id, nombre').in('id', ids)
  for (const p of (data ?? []) as any[]) mapa.set(p.id, p.nombre)
  return mapa
}
