'use server'

import { revalidatePath } from 'next/cache'
import { resolverDiscrepancia, type ResolucionInput } from '@/services/recepciones'

export type EstadoResolucion = { error: string } | null

export async function resolverDiscrepanciaAction(
  recepcionId: string,
  _previo: EstadoResolucion,
  form: FormData
): Promise<EstadoResolucion> {
  const accionTomada = String(form.get('accionTomada') ?? '') as ResolucionInput['accionTomada']
  const recepcionItemId = String(form.get('recepcionItemId') ?? '')
  const cantidadAjustadaRaw = form.get('cantidadAceptadaAjustada')
  const comentario = String(form.get('comentario') ?? '').trim() || null

  if (!recepcionItemId || !accionTomada) return { error: 'Faltan datos de la línea.' }

  try {
    await resolverDiscrepancia({
      recepcionItemId,
      accionTomada,
      cantidadAceptadaAjustada:
        accionTomada === 'aceptado_con_ajuste' && cantidadAjustadaRaw
          ? Number(cantidadAjustadaRaw)
          : null,
      comentario,
    })
  } catch (e) {
    return { error: (e as Error).message }
  }

  // La misma pantalla se re-renderiza con la resolución ya guardada, y si
  // era la última línea pendiente, con la recepción marcada conforme.
  revalidatePath(`/almacen/recepciones/${recepcionId}`)
  return null
}
