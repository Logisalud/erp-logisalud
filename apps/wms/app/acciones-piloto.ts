'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { COOKIE_BIENVENIDA_PILOTO } from '@/domain/modo-piloto'
import { exigirContexto } from '@/lib/contexto'

/** «Entendido»: recuerda en este navegador que esta persona ya leyó la bienvenida del piloto (no es un dato del negocio) y la lleva al Inicio. */
export async function aceptarBienvenidaPilotoAccion(): Promise<void> {
  const ctx = await exigirContexto()
  cookies().set(COOKIE_BIENVENIDA_PILOTO, ctx.usuario.id, { path: '/', maxAge: 60 * 60 * 24 * 60, sameSite: 'lax', httpOnly: true })
  redirect('/')
}
