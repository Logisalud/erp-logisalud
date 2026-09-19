'use server'

import { revalidatePath } from 'next/cache'
import { aprobarEnLote } from '@/services/aprobar-en-lote'
import { cortarUno } from '@/services/cortar-uno'
import { resumirLote, type ResultadoFila } from '@/domain/aprobacion-en-lote'
import { esAccionCorte, ETIQUETA_ACCION } from '@/domain/corte'
import { ETIQUETA_TIPO_PENDIENTE } from '@/domain/pendientes-aprobar'

export type EstadoLote =
  | { ok: true; resumen: string; resultados: ResultadoFila[] }
  | { ok: false; error: string }
  | null

/**
 * Aprobar en lote lo seleccionado en una sección de la bandeja.
 *
 * Devuelve SIEMPRE el detalle de qué entró y qué no, porque sin
 * transacciones un lote puede quedar a medias — ver
 * services/aprobar-en-lote.ts. Nunca un "listo" que no distinga 6 de 6 de
 * 4 de 6.
 */
export async function aprobarEnLoteAction(
  _previo: EstadoLote,
  form: FormData
): Promise<EstadoLote> {
  // Solo los ids. El tipo de cada fila lo resuelve el servicio releyendo la
  // bandeja, así que el navegador no puede afirmar de qué tipo es nada.
  const ids = form.getAll('pendienteId').map(String).filter(Boolean)

  try {
    const resultados = await aprobarEnLote(ids)
    revalidatePath('/pendientes-aprobar')
    return { ok: true, resumen: resumirLote(resultados), resultados }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo aprobar el lote.' }
  }
}

export type EstadoCorte = { ok: true; resumen: string } | { ok: false; error: string } | null

/**
 * Rechazar o anular UN registro. Nunca varios: el motivo es de esa fila y
 * de ninguna otra (ver domain/corte.ts).
 *
 * El id viaja en el formulario y no por `bind`, para que el mismo panel
 * sirva a cualquier fila sin crear una acción por registro.
 */
export async function cortarUnoAction(
  _previo: EstadoCorte,
  form: FormData
): Promise<EstadoCorte> {
  const id = String(form.get('pendienteId') ?? '')
  const accion = String(form.get('accion') ?? '')
  const motivo = String(form.get('motivo') ?? '')

  if (!id) return { ok: false, error: 'No se eligió ningún registro.' }
  if (!esAccionCorte(accion)) return { ok: false, error: 'Acción desconocida.' }

  try {
    const { codigo, tipo } = await cortarUno(id, accion, motivo)
    revalidatePath('/pendientes-aprobar')
    return {
      ok: true,
      resumen: `Se ${ETIQUETA_ACCION[accion].hechoSingular} ${ETIQUETA_TIPO_PENDIENTE[tipo]} ${codigo}.`,
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo completar la acción.' }
  }
}
