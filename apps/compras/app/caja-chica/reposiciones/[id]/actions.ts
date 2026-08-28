'use server'

import { revalidatePath } from 'next/cache'
import {
  aprobarPorJefe, rechazarPorJefe, aprobarPorContabilidad, rechazarPorContabilidad,
  obtenerUrlComprobanteMovimiento,
} from '@/services/caja-chica'

export type EstadoAccion = { error: string } | null

async function ejecutar(reposicionId: string, fn: () => Promise<void>): Promise<EstadoAccion> {
  try {
    await fn()
  } catch (e) {
    return { error: (e as Error).message }
  }
  revalidatePath(`/caja-chica/reposiciones/${reposicionId}`)
  return null
}

export async function aprobarPorJefeAction(id: string): Promise<EstadoAccion> {
  return ejecutar(id, () => aprobarPorJefe(id))
}

export async function rechazarPorJefeAction(id: string): Promise<EstadoAccion> {
  return ejecutar(id, () => rechazarPorJefe(id))
}

export async function aprobarPorContabilidadAction(id: string): Promise<EstadoAccion> {
  return ejecutar(id, () => aprobarPorContabilidad(id))
}

export async function rechazarPorContabilidadAction(id: string): Promise<EstadoAccion> {
  return ejecutar(id, () => rechazarPorContabilidad(id))
}

export async function verComprobanteAction(storagePath: string): Promise<{ url: string } | { error: string }> {
  try {
    const url = await obtenerUrlComprobanteMovimiento(storagePath)
    return { url }
  } catch (e) {
    return { error: (e as Error).message }
  }
}
