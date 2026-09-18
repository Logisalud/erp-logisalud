'use server'

import { revalidatePath } from 'next/cache'
import { cerrarOCConSaldoPendiente } from '@/services/ordenes-compra'

export type EstadoCierre = { error: string } | null

/**
 * Cierra la OC con saldo pendiente desde la ficha de la recepción.
 *
 * Reusa `cerrarOCConSaldoPendiente` (migración 0030), que ya deja
 * `cierre_tipo = 'saldo_no_entregado'` y el motivo — no reimplementa el
 * cierre. Lo único nuevo es el punto de entrada: antes solo se podía desde
 * la ficha de la OC, y Charlie tenía que navegar hasta allá.
 */
export async function cerrarOCDesdeRecepcionAction(
  ocId: string,
  _previo: EstadoCierre,
  form: FormData
): Promise<EstadoCierre> {
  const motivo = String(form.get('motivo') ?? '').trim()
  if (!motivo) return { error: 'Contá por qué se cierra la orden.' }
  try {
    await cerrarOCConSaldoPendiente(ocId, motivo)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'No se pudo cerrar la orden.' }
  }
  revalidatePath(`/ordenes-compra/${ocId}`)
  return null
}
