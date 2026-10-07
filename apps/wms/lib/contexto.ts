import 'server-only'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import type { Rol } from '@/domain/tipos'
import { ETIQUETA_ROL } from '@/domain/permisos'
import { modoDemoActivo } from './demo'
import { COOKIE_ROL_DEMO, nombreDemo, rolDemoDesdeCookie } from './sesion-demo'

export interface Contexto {
  usuario: { id: string; nombre: string }
  roles: Rol[]
  demo: boolean
}

/** La persona logueada y sus roles WMS; null si no hay sesión. */
export async function obtenerContexto(): Promise<Contexto | null> {
  if (modoDemoActivo()) {
    const rol = rolDemoDesdeCookie(cookies().get(COOKIE_ROL_DEMO)?.value)
    if (!rol) return null
    return { usuario: { id: `demo:${rol}`, nombre: nombreDemo(rol) }, roles: [rol], demo: true }
  }
  const { perfilActual, usuarioActual, crearClienteServidor } = await import('@logisalud/auth/server')
  const user = await usuarioActual()
  if (!user) return null
  const perfil = await perfilActual()
  const supabase = crearClienteServidor()
  const hoy = new Date().toISOString().slice(0, 10)
  const { data } = await supabase.schema('wms').from('usuario_roles').select('rol, desde, hasta').eq('user_id', user.id)
  const roles = (data ?? [])
    .filter((r: { desde: string; hasta: string | null }) => r.desde <= hoy && (!r.hasta || r.hasta >= hoy))
    .map((r: { rol: string }) => r.rol as Rol)
  return { usuario: { id: user.id, nombre: perfil?.nombre ?? user.email ?? 'Usuario' }, roles, demo: false }
}

/** Exige sesión; sin sesión manda al login. Sin roles WMS, a la pantalla de sin acceso. */
export async function exigirContexto(): Promise<Contexto> {
  const ctx = await obtenerContexto()
  if (!ctx) redirect('/login')
  if (ctx.roles.length === 0) redirect('/sin-acceso')
  return ctx
}

export const etiquetaRoles = (roles: Rol[]) => roles.map((r) => ETIQUETA_ROL[r]).join(' · ')
