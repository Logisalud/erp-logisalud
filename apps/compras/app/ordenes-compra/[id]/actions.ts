'use server'

import { revalidatePath } from 'next/cache'
import { cambiarEstadoOC } from '@/services/ordenes-compra'

export type EstadoAccionOC = { error: string } | null

export async function marcarEnviadaAction(id: string, _previo: EstadoAccionOC): Promise<EstadoAccionOC> {
  try {
    await cambiarEstadoOC(id, 'enviada')
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'No se pudo marcar como enviada.' }
  }
  revalidatePath(`/ordenes-compra/${id}`)
  return null
}

export async function marcarConfirmadaAction(id: string, _previo: EstadoAccionOC): Promise<EstadoAccionOC> {
  try {
    await cambiarEstadoOC(id, 'confirmada')
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'No se pudo confirmar.' }
  }
  revalidatePath(`/ordenes-compra/${id}`)
  return null
}
