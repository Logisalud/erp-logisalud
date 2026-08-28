import 'server-only'
import { crearClienteServidor } from '@logisalud/auth/server'

export type Usuario = { id: string; nombre: string; area: string }

/**
 * Lista de usuarios para elegir a alguien (ej. custodio de un fondo de caja
 * chica) — RLS de `public.perfiles` restringe esto a admin/contabilidad, así
 * que solo esas áreas la van a poder usar de verdad; para cualquier otra
 * persona vuelve solo su propia fila.
 */
export async function listarUsuarios(): Promise<Usuario[]> {
  const supabase = crearClienteServidor()
  const { data, error } = await supabase.from('perfiles').select('id, nombre, area').order('nombre')
  if (error) throw new Error(`No se pudieron listar los usuarios: ${error.message}`)
  return data ?? []
}
