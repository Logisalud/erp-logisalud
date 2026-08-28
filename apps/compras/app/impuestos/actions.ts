'use server'

import { revalidatePath } from 'next/cache'
import { confirmarObligacionTributaria } from '@/services/impuestos'

export type EstadoAccion = { error: string } | null

export async function confirmarObligacionTributariaAction(id: string): Promise<EstadoAccion> {
  try {
    await confirmarObligacionTributaria(id)
  } catch (e) {
    return { error: (e as Error).message }
  }
  revalidatePath('/impuestos')
  return null
}
