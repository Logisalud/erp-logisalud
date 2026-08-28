'use server'

import { redirect } from 'next/navigation'
import { crearReposicion } from '@/services/caja-chica'

export type EstadoAccion = { error: string } | null

export async function crearReposicionAction(fondoId: string): Promise<EstadoAccion> {
  let reposicion: { id: string }
  try {
    reposicion = await crearReposicion(fondoId)
  } catch (e) {
    return { error: (e as Error).message }
  }
  redirect(`/caja-chica/reposiciones/${reposicion.id}`)
}
