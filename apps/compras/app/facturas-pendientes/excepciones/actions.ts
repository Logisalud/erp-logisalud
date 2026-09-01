'use server'

import { revalidatePath } from 'next/cache'
import { aprobarExcepcionConciliacion } from '@/services/facturas-pendientes'

export type EstadoAccion = { error: string } | null

export async function aprobarExcepcionAction(facturaPendienteId: string): Promise<EstadoAccion> {
  try {
    await aprobarExcepcionConciliacion(facturaPendienteId)
  } catch (e) {
    return { error: (e as Error).message }
  }
  revalidatePath('/facturas-pendientes/excepciones')
  return null
}
