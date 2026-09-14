import 'server-only'
import { crearClienteServidor, exigirUsuario, perfilActual } from '@logisalud/auth/server'
import { validarAporte, type BorradorAporte } from '@/domain/aporte-accionista'

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

  const ahora = new Date()
  const yyyy = String(ahora.getFullYear())
  const mm = String(ahora.getMonth() + 1).padStart(2, '0')
  const nombreLimpio = archivo.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${yyyy}/${mm}/${aporte.codigo}/${Date.now()}-${nombreLimpio}`

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
