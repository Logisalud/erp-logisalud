'use server'

import { redirect } from 'next/navigation'
import {
  cargarRendicionDesdeExcel, crearReposicion, subirExcelRendicion,
} from '@/services/caja-chica'
import type { FilaRendicion } from '@/lib/excel-caja-chica'

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

/** Sube el .xlsx SOLO. En su propio request: junto con las filas podría
 *  pasar el límite de body de una Server Action. */
export async function subirExcelRendicionAction(
  fondoId: string,
  form: FormData
): Promise<{ path: string } | { error: string }> {
  const archivo = form.get('archivo')
  if (!(archivo instanceof File)) return { error: 'No llegó ningún archivo.' }
  return subirExcelRendicion(fondoId, archivo)
}

/**
 * Confirma la rendición. Recibe las filas YA PARSEADAS en el cliente, pero
 * no confía en ellas: el servicio revalida las categorías contra la base y
 * recalcula todo. Lo que el navegador manda es una propuesta, no un hecho.
 */
export async function cargarRendicionAction(
  fondoId: string,
  _previo: EstadoAccion,
  form: FormData
): Promise<EstadoAccion> {
  let resultado: { reposicionId: string }
  try {
    const filas = JSON.parse(String(form.get('filas') ?? '[]')) as FilaRendicion[]
    const pathExcel = String(form.get('excelPath') ?? '') || null
    resultado = await cargarRendicionDesdeExcel({ fondoId, filas, storagePathExcel: pathExcel })
  } catch (e) {
    return { error: (e as Error).message }
  }
  redirect(`/caja-chica/reposiciones/${resultado.reposicionId}`)
}
