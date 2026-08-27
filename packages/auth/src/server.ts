import 'server-only'

import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { anonKeySupabase, dominioCookie, urlSupabase } from './config'

/**
 * Cliente de Supabase para Server Components y Server Actions.
 *
 * Usa la anon key + la sesión de la persona, así que **queda sujeto a RLS**.
 * Este es el cliente que hay que usar para toda lectura/escritura de negocio
 * del módulo de Compras. El cliente de service role (que bypassa RLS) sigue
 * siendo para tareas administrativas, nunca para servir una request.
 */
export function crearClienteServidor() {
  const store = cookies()
  return createServerClient(urlSupabase(), anonKeySupabase(), {
    cookieOptions: { domain: dominioCookie() },
    cookies: {
      getAll: () => store.getAll(),
      setAll: (nuevas: { name: string; value: string; options?: CookieOptions }[]) => {
        try {
          nuevas.forEach(({ name, value, options }) => store.set(name, value, options))
        } catch {
          // Un Server Component no puede escribir cookies. La renovación de
          // la sesión la hace el middleware, así que acá se ignora.
        }
      },
    },
  })
}

/**
 * La persona detrás de la request actual, o null si no hay sesión.
 *
 * Usar SIEMPRE esto para llenar created_by, conformidad_por, decidido_por,
 * etc. Nunca hardcodear un uuid.
 */
export async function usuarioActual() {
  const supabase = crearClienteServidor()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}

/**
 * Igual que usuarioActual() pero falla si no hay nadie. Para Server Actions
 * que escriben: si no hay sesión, no hay a quién atribuir el cambio y las
 * políticas RLS iban a rechazarlo igual.
 */
export async function exigirUsuario() {
  const user = await usuarioActual()
  if (!user) throw new Error('No hay sesión activa. Iniciá sesión de nuevo.')
  return user
}

/**
 * El perfil (nombre, área, rol) de la persona actual, o null si no tiene.
 *
 * El `.eq('id', ...)` NO es redundante con RLS. La policy de perfiles es
 * `id = auth.uid() OR es_admin()`, así que a un admin le devuelve TODAS las
 * filas — y `maybeSingle()` falla si llega más de una. Sin el filtro, la
 * función andaba para cualquier operativo y se rompía justo para los admins,
 * que quedaban sin área y por lo tanto sin ningún módulo a la vista.
 */
export async function perfilActual() {
  const user = await usuarioActual()
  if (!user) return null

  const supabase = crearClienteServidor()
  const { data, error } = await supabase
    .from('perfiles')
    .select('id, nombre, area, rol')
    .eq('id', user.id)
    .maybeSingle()

  // Un fallo acá deja a la persona sin área y sin módulos, que es
  // indistinguible de "no tiene permisos". Que quede en los logs.
  if (error) {
    console.error('[auth] no se pudo leer el perfil:', error.message)
    return null
  }

  return data
}
