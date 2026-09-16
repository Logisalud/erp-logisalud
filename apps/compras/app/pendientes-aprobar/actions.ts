'use server'

import { revalidatePath } from 'next/cache'
import { aprobarEnLote } from '@/services/aprobar-en-lote'
import { resumirLote, type ResultadoFila } from '@/domain/aprobacion-en-lote'

export type EstadoLote =
  | { ok: true; resumen: string; resultados: ResultadoFila[] }
  | { ok: false; error: string }
  | null

/**
 * Aprobar en lote lo seleccionado en la bandeja.
 *
 * Devuelve SIEMPRE el detalle de qué entró y qué no, porque sin
 * transacciones un lote puede quedar a medias — ver services/aprobar-en-lote.ts.
 * Nunca un "listo" que no distinga 6 de 6 de 4 de 6.
 */
export async function aprobarEnLoteAction(
  _previo: EstadoLote,
  form: FormData
): Promise<EstadoLote> {
  // Solo los ids. El tipo de cada fila lo resuelve el servicio releyendo la
  // bandeja, así que el navegador ya no puede afirmar de qué tipo es nada.
  const ids = form.getAll('pendienteId').map(String).filter(Boolean)

  try {
    const resultados = await aprobarEnLote(ids)
    revalidatePath('/pendientes-aprobar')
    return { ok: true, resumen: resumirLote(resultados), resultados }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo aprobar el lote.' }
  }
}
