'use server'

import { redirect } from 'next/navigation'
import { registrarRecepcion } from '@/services/recepciones'
import { validarRecepcion, type BorradorRecepcion } from '@/domain/recepcion'

export type EstadoFormulario = { errores: { campo: string; mensaje: string }[] } | null

/**
 * Registra la recepción. Valida en el servidor con `validarRecepcion` aunque
 * el formulario ya valide en el navegador — mismo criterio que
 * ordenes-compra/nueva/actions.ts.
 */
export async function registrarRecepcionAction(
  ocId: string,
  _previo: EstadoFormulario,
  form: FormData
): Promise<EstadoFormulario> {
  const borrador: BorradorRecepcion = {
    ocId,
    fechaRecepcion: String(form.get('fechaRecepcion') ?? ''),
    guiaRemision: textoONull(form.get('guiaRemision')),
    lineas: leerLineas(form),
  }

  const errores = validarRecepcion(borrador)
  if (errores.length > 0) return { errores }

  let recepcion: { id: string }
  try {
    recepcion = await registrarRecepcion(borrador)
  } catch (e) {
    return { errores: [{ campo: 'general', mensaje: (e as Error).message }] }
  }

  redirect(`/almacen/recepciones/${recepcion.id}`)
}

function leerLineas(form: FormData) {
  const ocItemIds = form.getAll('linea_ocItemId').map(String)
  const cantidadesFisicas = form.getAll('linea_cantidadFisica').map(String)
  const cantidadesGuia = form.getAll('linea_cantidadGuia').map(String)
  const lotes = form.getAll('linea_lote').map(String)
  const fechasVencimiento = form.getAll('linea_fechaVencimiento').map(String)
  const danados = form.getAll('linea_danado').map(String)
  const productosErroneos = form.getAll('linea_productoErroneo').map(String)
  const controlaLotes = form.getAll('linea_controlaLote').map(String)
  const controlaVencimientos = form.getAll('linea_controlaVencimiento').map(String)

  return ocItemIds.map((ocItemId, i) => ({
    ocItemId,
    cantidadFisica: Number(cantidadesFisicas[i] ?? 0),
    cantidadGuia: numeroONull(cantidadesGuia[i]),
    lote: textoONull(lotes[i]),
    fechaVencimiento: textoONull(fechasVencimiento[i]),
    danado: danados[i] === 'true',
    productoErroneo: productosErroneos[i] === 'true',
    controlaLote: controlaLotes[i] === 'true',
    controlaVencimiento: controlaVencimientos[i] === 'true',
  }))
}

function textoONull(v: FormDataEntryValue | null | string): string | null {
  const s = v == null ? '' : String(v).trim()
  return s === '' ? null : s
}

function numeroONull(v: FormDataEntryValue | null | string): number | null {
  const s = textoONull(v)
  return s == null ? null : Number(s)
}
