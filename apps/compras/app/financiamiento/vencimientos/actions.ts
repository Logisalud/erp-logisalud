'use server'

import { revalidatePath } from 'next/cache'
import { generarObligacionesVencimientos } from '@/services/financiamiento'
import type { TipoVencimiento } from '@/domain/financiamiento'

export type EstadoAccion = { error: string } | null

export async function generarObligacionesAction(seleccion: { tipo: TipoVencimiento; id: string }[]): Promise<EstadoAccion> {
  if (seleccion.length === 0) return { error: 'Elegí al menos un vencimiento.' }
  try {
    await generarObligacionesVencimientos(seleccion)
  } catch (e) {
    return { error: (e as Error).message }
  }
  revalidatePath('/financiamiento/vencimientos')
  revalidatePath('/cuentas-por-pagar')
  return null
}
