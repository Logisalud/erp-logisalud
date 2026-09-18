'use server'

import { redirect } from 'next/navigation'
import {
  registrarRecepcionTresColumnas, subirDocumentoRecepcion,
} from '@/services/recepciones'

export type EstadoFormulario = { error: string } | null

/** Sube un documento SOLO. Ver el comentario del servicio: va en su propio
 *  request para no chocar con el límite de body de la Server Action. */
export async function subirDocumentoAction(
  ocCodigo: string,
  cual: 'guia' | 'factura',
  form: FormData
): Promise<{ path: string } | { error: string }> {
  const archivo = form.get('archivo')
  if (!(archivo instanceof File)) return { error: 'No llegó ningún archivo.' }
  return subirDocumentoRecepcion(ocCodigo, cual, archivo)
}

/**
 * Registra la recepción y, con ella, la obligación.
 *
 * Las cantidades llegan del formulario pero los PRECIOS no: el servicio los
 * lee de la OC. Almacén declara qué llegó, nunca cuánto vale.
 */
export async function registrarRecepcionAction(
  ocId: string,
  _previo: EstadoFormulario,
  form: FormData
): Promise<EstadoFormulario> {
  let resultado: { recepcionId: string }
  try {
    resultado = await registrarRecepcionTresColumnas({
      ocId,
      fechaRecepcion: String(form.get('fechaRecepcion') ?? ''),
      numerosGuia: String(form.get('numerosGuia') ?? '')
        .split(',')
        .map((g) => g.trim())
        .filter(Boolean),
      numeroFactura: String(form.get('numeroFactura') ?? ''),
      storagePathGuia: String(form.get('pathGuia') ?? '') || null,
      storagePathFactura: String(form.get('pathFactura') ?? '') || null,
      lineas: JSON.parse(String(form.get('lineas') ?? '[]')),
    })
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'No se pudo registrar la recepción.' }
  }
  redirect(`/almacen/recepciones/${resultado.recepcionId}`)
}
