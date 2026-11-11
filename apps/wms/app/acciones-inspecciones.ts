'use server'

import { exigirContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import type { DatosInspeccion } from '@/services/repositorio-inspecciones'
import type { Actor } from '@/services/repositorio'

async function quien(): Promise<Actor> {
  const ctx = await exigirContexto()
  return { id: ctx.usuario.id, nombre: ctx.usuario.nombre, roles: ctx.roles }
}

/** La inspección de la unidad (LS-FR.49.03 o LS-FR.52.03) de un día. Las reglas las aplica la base; aquí no se repiten. */
export async function registrarInspeccionAccion(d: DatosInspeccion) { return repositorio().registrarInspeccion(d, await quien()) }
/** La supervisa otra persona (nunca quien la hizo). */
export async function supervisarInspeccionAccion(id: string) { return repositorio().supervisarInspeccion(id, await quien()) }
