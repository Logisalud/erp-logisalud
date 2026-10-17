import 'server-only'
import { crearClienteServidor, perfilActual } from '@logisalud/auth/server'
import { validarPersonaSinUsuario, type BorradorPersonaSinUsuario } from '@/domain/persona-sin-usuario'

/**
 * El nombre de a quién se le paga una obligación sin proveedor, a partir de
 * `obligaciones.beneficiario_id` (migración 0081): un usuario
 * (`public.perfiles`) o una persona sin usuario (`public.personas_sin_usuario`,
 * ej. un vendedor). Los UUID no chocan entre tablas, así que un solo `Map`
 * sirve para las dos.
 *
 * Antes había cuatro copias de esto (obligaciones, propuestas y dos
 * reportes) que solo miraban `perfiles`: una persona sin usuario habría
 * salido como "—" en todas. Una sola función, un solo lugar que se entera.
 */
export async function mapaNombresBeneficiarios(ids: readonly (string | null | undefined)[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids.filter((x): x is string => !!x))]
  if (unicos.length === 0) return new Map()
  const supabase = crearClienteServidor()
  const [{ data: perfiles }, { data: personas }] = await Promise.all([
    supabase.from('perfiles').select('id, nombre').in('id', unicos),
    supabase.from('personas_sin_usuario').select('id, nombre').in('id', unicos),
  ])
  return new Map(
    [...(perfiles ?? []), ...(personas ?? [])]
      .filter((p: any) => !!p.nombre)
      .map((p: any) => [p.id as string, p.nombre as string])
  )
}

export type PersonaSinUsuario = { id: string; nombre: string; dni: string | null; activo: boolean }

/** La lista para elegir y para administrar. Por nombre. */
export async function listarPersonasSinUsuario({ soloActivas }: { soloActivas: boolean }): Promise<PersonaSinUsuario[]> {
  const supabase = crearClienteServidor()
  let consulta = supabase.from('personas_sin_usuario').select('id, nombre, dni, activo').order('nombre')
  if (soloActivas) consulta = consulta.eq('activo', true)
  const { data, error } = await consulta
  if (error) throw new Error(`No se pudo leer la lista de personas sin usuario: ${error.message}`)
  return (data ?? []) as PersonaSinUsuario[]
}

/** Quien mantiene la lista — mismo criterio que la RLS de la 0081. */
export async function puedeAdministrarPersonas(): Promise<boolean> {
  const perfil = await perfilActual()
  return perfil?.area === 'contabilidad' || perfil?.area === 'admin'
}

export async function obtenerPersonaSinUsuario(id: string): Promise<PersonaSinUsuario | null> {
  const supabase = crearClienteServidor()
  const { data, error } = await supabase
    .from('personas_sin_usuario').select('id, nombre, dni, activo').eq('id', id).maybeSingle()
  if (error) throw new Error(`No se pudo leer la persona: ${error.message}`)
  return data as PersonaSinUsuario | null
}

/** Cuántas cuentas tiene cada una — para avisar en la lista a quién le falta. */
export async function cuentasPorPersona(): Promise<Map<string, number>> {
  const supabase = crearClienteServidor()
  const { data } = await supabase
    .from('empleado_cuentas_bancarias').select('persona_sin_usuario_id').not('persona_sin_usuario_id', 'is', null)
  const mapa = new Map<string, number>()
  for (const f of data ?? []) {
    const id = (f as any).persona_sin_usuario_id as string
    mapa.set(id, (mapa.get(id) ?? 0) + 1)
  }
  return mapa
}

function mensajeDeError(error: { code?: string; message: string }, nombre: string): string {
  if (error.code === '23505') return `Ya hay alguien llamado "${nombre}" en la lista.`
  return error.message
}

export async function crearPersonaSinUsuario(borrador: BorradorPersonaSinUsuario): Promise<{ id: string }> {
  const errores = validarPersonaSinUsuario(borrador)
  if (errores.length > 0) throw new Error(errores[0])
  const supabase = crearClienteServidor()
  const { data, error } = await supabase
    .from('personas_sin_usuario')
    .insert({ nombre: borrador.nombre.trim(), dni: borrador.dni?.trim() || null })
    .select('id')
    .single()
  if (error) throw new Error(`No se pudo agregar: ${mensajeDeError(error, borrador.nombre.trim())}`)
  return data
}

export async function actualizarPersonaSinUsuario(
  id: string,
  borrador: BorradorPersonaSinUsuario & { activo: boolean },
): Promise<void> {
  const errores = validarPersonaSinUsuario(borrador)
  if (errores.length > 0) throw new Error(errores[0])
  const supabase = crearClienteServidor()
  const { error } = await supabase
    .from('personas_sin_usuario')
    .update({ nombre: borrador.nombre.trim(), dni: borrador.dni?.trim() || null, activo: borrador.activo })
    .eq('id', id)
  if (error) throw new Error(`No se pudo guardar: ${mensajeDeError(error, borrador.nombre.trim())}`)
}
