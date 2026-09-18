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
      // Las guías viajan como JSON porque cada una es un par (número +
      // archivo) y un FormData plano no representa una lista de pares sin
      // inventar nombres tipo `guia[0][numero]`. El archivo ya se subió
      // antes, en su propio request: acá solo llega su ruta.
      guias: parsearGuias(form.get('guias')),
      numeroFactura: String(form.get('numeroFactura') ?? ''),
      storagePathFactura: String(form.get('pathFactura') ?? '') || null,
      lineas: JSON.parse(String(form.get('lineas') ?? '[]')),
    })
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'No se pudo registrar la recepción.' }
  }
  redirect(`/almacen/recepciones/${resultado.recepcionId}`)
}

/**
 * Las guías que manda el formulario. Tolera basura de entrada —devuelve
 * lista vacía— y deja que `validarRecepcionTresColumnas` sea la que exige al
 * menos una completa: la validación de negocio vive en el dominio, no acá.
 */
function parsearGuias(crudo: FormDataEntryValue | null): { numero: string; storagePath: string | null }[] {
  if (typeof crudo !== 'string' || !crudo) return []
  try {
    const datos = JSON.parse(crudo)
    if (!Array.isArray(datos)) return []
    return datos.map((g: any) => ({
      numero: typeof g?.numero === 'string' ? g.numero : '',
      storagePath: typeof g?.storagePath === 'string' && g.storagePath ? g.storagePath : null,
    }))
  } catch {
    return []
  }
}
