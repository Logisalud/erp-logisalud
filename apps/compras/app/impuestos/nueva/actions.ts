'use server'

import { redirect } from 'next/navigation'
import { cargarObligacionesTributarias } from '@/services/impuestos'
import type { EncabezadoCarga, FuenteImpuesto, LineaCarga } from '@/domain/impuestos'

export type EstadoFormulario = { errores: { campo: string; mensaje: string }[] } | null

/**
 * Carga N líneas de impuesto en un solo envío — así llega el reporte PLAME
 * de BUK, que agrupa varios impuestos del mismo periodo.
 *
 * Las líneas viajan como campos repetidos (`linea_tipo`, `linea_monto`,
 * `linea_vencimiento`), mismo patrón que las líneas de una OC: `getAll()`
 * las devuelve en orden y se cruzan por índice.
 *
 * `fuente` es del ENCABEZADO y no de las líneas: dice de dónde vino el dato
 * (BUK / SUNAT / manual), no qué tributo es. El tipo de impuesto —eso sí por
 * línea— es un uuid del catálogo. Ver el comentario en domain/impuestos.ts.
 */
export async function cargarObligacionesTributariasAction(
  _previo: EstadoFormulario,
  form: FormData
): Promise<EstadoFormulario> {
  const encabezado: EncabezadoCarga = {
    periodo: String(form.get('periodo') ?? ''),
    fuente: String(form.get('fuente') ?? 'BUK') as FuenteImpuesto,
    fechaVencimiento: String(form.get('fechaVencimiento') ?? ''),
  }

  const tipos = form.getAll('linea_tipo').map(String)
  const montos = form.getAll('linea_monto').map(String)
  const vencimientos = form.getAll('linea_vencimiento').map(String)

  const lineas: LineaCarga[] = tipos.map((tipoImpuestoId, i) => ({
    tipoImpuestoId,
    monto: Number(montos[i] ?? 0),
    fechaVencimiento: vencimientos[i]?.trim() || null,
  }))

  const resultado = await cargarObligacionesTributarias(encabezado, lineas)
  if ('errores' in resultado) return { errores: resultado.errores }

  redirect('/impuestos')
}
