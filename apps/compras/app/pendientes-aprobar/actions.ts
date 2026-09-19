'use server'

import { revalidatePath } from 'next/cache'
import { aprobarEnLote } from '@/services/aprobar-en-lote'
import { cortarEnLote } from '@/services/cortar-en-lote'
import { resumirLote, type ResultadoFila } from '@/domain/aprobacion-en-lote'
import { esAccionCorte, resumirCorte } from '@/domain/corte-en-lote'

export type EstadoLote =
  | { ok: true; resumen: string; resultados: ResultadoFila[] }
  | { ok: false; error: string }
  | null

/**
 * Las tres decisiones en lote de la bandeja: aprobar, rechazar y anular.
 *
 * Van por UNA sola Server Action y no por tres, porque comparten todo lo que
 * importa: la misma selección, el mismo tope, el mismo resumen parcial
 * honesto y el mismo `useFormState` en la pantalla. Cuál se ejecuta lo dice
 * el botón que se apretó (`name="accion"`), no una acción distinta por cada
 * formulario.
 *
 * Devuelve SIEMPRE el detalle de qué entró y qué no: sin transacciones un
 * lote puede quedar a medias (ver services/aprobar-en-lote.ts y
 * services/cortar-en-lote.ts). Nunca un "listo" que no distinga 6 de 6 de
 * 4 de 6.
 */
export async function decidirEnLoteAction(
  _previo: EstadoLote,
  form: FormData
): Promise<EstadoLote> {
  // Solo los ids. El tipo de cada fila lo resuelve el servicio releyendo la
  // bandeja, así que el navegador no puede afirmar de qué tipo es nada.
  const ids = form.getAll('pendienteId').map(String).filter(Boolean)
  const accion = String(form.get('accion') ?? 'aprobar')
  const motivo = String(form.get('motivo') ?? '')

  try {
    if (esAccionCorte(accion)) {
      const resultados = await cortarEnLote(ids, accion, motivo)
      revalidatePath('/pendientes-aprobar')
      return { ok: true, resumen: resumirCorte(resultados, accion), resultados }
    }
    if (accion !== 'aprobar') throw new Error('Acción desconocida.')

    const resultados = await aprobarEnLote(ids)
    revalidatePath('/pendientes-aprobar')
    return { ok: true, resumen: resumirLote(resultados), resultados }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo procesar el lote.' }
  }
}
