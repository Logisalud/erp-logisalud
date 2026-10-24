import 'server-only'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import type { Rol } from '@/domain/tipos'
import { ETIQUETA_ROL, rolesEfectivos } from '@/domain/permisos'
import { modoDemoActivo } from './demo'
import { COOKIE_ROL_DEMO, personaDemoDesdeCookie } from './sesion-demo'

export interface Contexto {
  usuario: { id: string; nombre: string }
  /** El cargo de la persona (se muestra aparte de sus roles, que son sus permisos). */
  cargo?: string
  /** Los roles con los que opera (el Administrador suma los operativos: D-194). */
  roles: Rol[]
  /** Los roles que realmente tiene asignados (lo que se muestra). */
  rolesAsignados?: Rol[]
  demo: boolean
}

/** La persona logueada y sus roles WMS; null si no hay sesión. */
export async function obtenerContexto(): Promise<Contexto | null> {
  if (modoDemoActivo()) {
    const p = personaDemoDesdeCookie(cookies().get(COOKIE_ROL_DEMO)?.value)
    if (!p) return null
    return { usuario: { id: `demo:${p.clave}`, nombre: p.nombre }, cargo: p.cargo, roles: rolesEfectivos(p.roles), rolesAsignados: p.roles, demo: true }
  }
  const { perfilActual, usuarioActual, crearClienteServidor } = await import('@logisalud/auth/server')
  const user = await usuarioActual()
  if (!user) return null
  const perfil = await perfilActual()
  const supabase = crearClienteServidor()
  const hoy = new Date().toISOString().slice(0, 10)
  const { data } = await supabase.schema('wms').from('usuario_roles').select('rol, desde, hasta').eq('user_id', user.id)
  // Solo roles que existen: una fila histórica de un rol retirado (reemplazo_jefe) no da nada
  const roles = (data ?? [])
    .filter((r: { desde: string; hasta: string | null }) => r.desde <= hoy && (!r.hasta || r.hasta >= hoy))
    .map((r: { rol: string }) => r.rol as Rol)
    .filter((r) => r in ETIQUETA_ROL)
  const { data: c } = await supabase.schema('wms').from('cargos_usuario').select('cargo').eq('user_id', user.id).maybeSingle()
  return { usuario: { id: user.id, nombre: perfil?.nombre ?? user.email ?? 'Usuario' }, cargo: (c as { cargo?: string } | null)?.cargo, roles: rolesEfectivos(roles), rolesAsignados: roles, demo: false }
}

/** Exige sesión; sin sesión manda al login. Sin roles WMS, a la pantalla de sin acceso. */
export async function exigirContexto(): Promise<Contexto> {
  const ctx = await obtenerContexto()
  if (!ctx) redirect('/login')
  if (ctx.roles.length === 0) redirect('/sin-acceso')
  return ctx
}

export const etiquetaRoles = (roles: Rol[]) => roles.map((r) => ETIQUETA_ROL[r]).join(' · ')

/** Lo que se muestra bajo el nombre: el cargo, y si no hay, los roles. */
export const etiquetaCargo = (ctx: Pick<Contexto, 'cargo' | 'roles' | 'rolesAsignados'>) => ctx.cargo ?? etiquetaRoles(ctx.rolesAsignados ?? ctx.roles)
