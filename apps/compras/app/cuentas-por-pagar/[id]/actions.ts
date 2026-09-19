'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import {
  darConformidad, anularPagoDirecto, rechazarPagoDirecto,
  obtenerObligacion, obtenerUrlLegajoPagoDirecto,
} from '@/services/obligaciones'
import {
  registrarNotaCredito, aplicarNotaCredito, registrarNotaCreditoDeRecepcion,
  subirNotaCreditoDeRecepcion,
} from '@/services/notas-credito'
import { obtenerUrlLegajoPago } from '@/services/pagos'
import {
  corregirFechaDePago, reemplazarConstanciaPago, registrarPagoHistorico, subirVoucherHistorico,
} from '@/services/pago-historico'
import { esArchivoReemplazable } from '@/domain/reemplazo-constancia'
import { obtenerUrlComprobante } from '@/services/solicitudes-gasto'

export type EstadoAccion = { error: string } | null

/**
 * Revalida la ficha Y todas las listas donde esa obligación aparece.
 *
 * Antes cada acción revalidaba solo `/cuentas-por-pagar/[id]`, así que
 * después de dar conformidad el listado y la bandeja seguían sirviendo el
 * estado anterior desde caché. Eso es lo que hizo que 6 reembolsos de Sebas
 * (C-0063 a C-0068) parecieran haber VUELTO a "Esperando conformidad" el
 * 2026-09-18: el historial de estados demuestra que nunca retrocedieron
 * —dos filas por obligación, `registrada → conforme` y nada más—, pero la
 * pantalla que Mariela tenía abierta se había renderizado antes de
 * aprobarlas y nadie la invalidó.
 *
 * Un susto de pérdida de datos que era caché. Por eso la lista de rutas vive
 * en un solo lugar: agregar una acción nueva y olvidarse de una ruta es
 * exactamente cómo volvería a pasar.
 */
function revalidarObligacion(obligacionId: string) {
  revalidatePath(`/cuentas-por-pagar/${obligacionId}`)
  revalidatePath('/cuentas-por-pagar')
  revalidatePath('/pendientes-aprobar')
  revalidatePath('/mis-operaciones')
  revalidatePath('/dashboard')
}

export async function darConformidadAction(obligacionId: string): Promise<EstadoAccion> {
  try {
    await darConformidad(obligacionId)
  } catch (e) {
    return { error: (e as Error).message }
  }
  revalidarObligacion(obligacionId)
  return null
}

export async function anularPagoDirectoAction(
  obligacionId: string,
  _previo: EstadoAccion,
  form: FormData
): Promise<EstadoAccion> {
  const motivo = String(form.get('motivo') ?? '')
  try {
    await anularPagoDirecto(obligacionId, motivo)
  } catch (e) {
    return { error: (e as Error).message }
  }
  revalidarObligacion(obligacionId)
  return null
}

export async function rechazarPagoDirectoAction(
  obligacionId: string,
  _previo: EstadoAccion,
  form: FormData
): Promise<EstadoAccion> {
  const motivo = String(form.get('motivo') ?? '')
  try {
    await rechazarPagoDirecto(obligacionId, motivo)
  } catch (e) {
    return { error: (e as Error).message }
  }
  revalidarObligacion(obligacionId)
  return null
}

export async function registrarNotaCreditoAction(
  obligacionId: string,
  _previo: EstadoAccion,
  form: FormData
): Promise<EstadoAccion> {
  const monto = Number(form.get('monto') ?? 0)
  const motivo = String(form.get('motivo') ?? '').trim()
  const numeroNc = String(form.get('numeroNc') ?? '').trim() || null

  if (!monto || monto <= 0) return { error: 'El monto tiene que ser mayor a 0.' }
  if (!motivo) return { error: 'Falta el motivo de la nota de crédito.' }

  const obligacion = await obtenerObligacion(obligacionId)
  if (!obligacion?.proveedor) return { error: 'No se pudo resolver el proveedor de esta obligación.' }

  try {
    await registrarNotaCredito({
      obligacionId,
      proveedorId: obligacion.proveedor.id,
      monto, moneda: obligacion.moneda, motivo, numeroNc,
    })
  } catch (e) {
    return { error: (e as Error).message }
  }
  revalidarObligacion(obligacionId)
  return null
}

export async function aplicarNotaCreditoAction(obligacionId: string, notaCreditoId: string): Promise<EstadoAccion> {
  try {
    await aplicarNotaCredito(notaCreditoId)
  } catch (e) {
    return { error: (e as Error).message }
  }
  revalidarObligacion(obligacionId)
  return null
}

export async function verVoucherAction(storagePath: string): Promise<{ url: string } | { error: string }> {
  try {
    const url = await obtenerUrlLegajoPago(storagePath)
    return { url }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

export async function verLegajoPagoDirectoAction(storagePath: string): Promise<{ url: string } | { error: string }> {
  try {
    const url = await obtenerUrlLegajoPagoDirecto(storagePath)
    return { url }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

/**
 * Registrar un pago del backlog que YA ocurrió. Solo para la categoría de
 * regularización pre-ERP — el servicio lo valida contra la base, no contra
 * el formulario.
 */
export async function registrarPagoHistoricoAction(
  obligacionId: string,
  _previo: EstadoAccion,
  form: FormData
): Promise<EstadoAccion> {
  try {
    await registrarPagoHistorico({
      obligacionId,
      fechaPago: String(form.get('fechaPago') ?? ''),
      numeroOperacion: textoONullPH(form.get('numeroOperacion')),
      storagePathVoucher: textoONullPH(form.get('voucherPath')),
    })
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'No se pudo registrar el pago.' }
  }
  revalidarObligacion(obligacionId)
  redirect(`/cuentas-por-pagar/${obligacionId}`)
}

/** La constancia viaja en su propio request — ver el comentario del servicio. */
export async function subirVoucherHistoricoAction(
  codigoObligacion: string,
  form: FormData
): Promise<{ path: string } | { error: string }> {
  const archivo = form.get('archivo')
  if (!(archivo instanceof File)) return { error: 'No llegó ningún archivo.' }
  try {
    return await subirVoucherHistorico(codigoObligacion, archivo)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'No se pudo subir la constancia.' }
  }
}

function textoONullPH(v: FormDataEntryValue | null): string | null {
  const s = v == null ? '' : String(v).trim()
  return s === '' ? null : s
}

/**
 * Reemplazar SOLO el archivo de la constancia de un pago ya registrado.
 * Ningún dato financiero viaja en este FormData — ver el servicio.
 */
export async function reemplazarConstanciaAction(
  obligacionId: string,
  _previo: EstadoAccion,
  form: FormData
): Promise<EstadoAccion> {
  const cual = String(form.get('cual') ?? '')
  if (!esArchivoReemplazable(cual)) return { error: 'Elige qué archivo estás reemplazando.' }

  try {
    await reemplazarConstanciaPago({
      obligacionId,
      cual,
      motivo: String(form.get('motivo') ?? ''),
      storagePathNuevo: String(form.get('archivoPath') ?? ''),
    })
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'No se pudo reemplazar la constancia.' }
  }
  revalidarObligacion(obligacionId)
  redirect(`/cuentas-por-pagar/${obligacionId}`)
}

/**
 * Corregir la fecha de un pago ya registrado.
 *
 * Va por su propia acción y su propio servicio, no por
 * `reemplazarConstanciaAction`: ahí no viaja ningún dato financiero a
 * propósito, y la fecha de pago sí lo es — mueve el pago entre periodos.
 */
export async function corregirFechaPagoAction(
  obligacionId: string,
  _previo: EstadoAccion,
  form: FormData
): Promise<EstadoAccion> {
  try {
    await corregirFechaDePago({
      obligacionId,
      fechaNueva: String(form.get('fechaNueva') ?? ''),
      motivo: String(form.get('motivo') ?? ''),
    })
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'No se pudo corregir la fecha del pago.' }
  }
  revalidarObligacion(obligacionId)
  redirect(`/cuentas-por-pagar/${obligacionId}`)
}

/**
 * La nota de crédito que libera una obligación del Caso A (llegó menos de lo
 * facturado). El archivo ya viajó en su propio request — acá solo llega su
 * ruta.
 *
 * Nada de lo que decide si la NC es válida viene de este formulario: el
 * total contra el que se compara el monto, la moneda y el proveedor los lee
 * el servicio de la base. Ver services/notas-credito.ts.
 */
export async function registrarNotaCreditoDeRecepcionAction(
  obligacionId: string,
  _previo: EstadoAccion,
  form: FormData
): Promise<EstadoAccion> {
  try {
    await registrarNotaCreditoDeRecepcion({
      obligacionId,
      monto: Number(form.get('monto') ?? 0),
      motivo: String(form.get('motivo') ?? ''),
      numeroNc: String(form.get('numeroNc') ?? ''),
      fechaEmision: String(form.get('fechaEmision') ?? ''),
      storagePath: textoONullPH(form.get('archivoPath')),
    })
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'No se pudo registrar la nota de crédito.' }
  }
  revalidarObligacion(obligacionId)
  redirect(`/cuentas-por-pagar/${obligacionId}`)
}

/** El archivo de la NC viaja en su propio request — ver el servicio. */
export async function subirArchivoNotaCreditoAction(
  codigoObligacion: string,
  form: FormData
): Promise<{ path: string } | { error: string }> {
  const archivo = form.get('archivo')
  if (!(archivo instanceof File)) return { error: 'No llegó ningún archivo.' }
  try {
    return await subirNotaCreditoDeRecepcion(codigoObligacion, archivo)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'No se pudo subir la nota de crédito.' }
  }
}

/** El comprobante de un gasto/reembolso vive en `legajos-gastos`, no en el
 *  bucket de compras — de ahí que necesite su propia firma. */
export async function verComprobanteGastoAction(
  storagePath: string
): Promise<{ url: string } | { error: string }> {
  try {
    return { url: await obtenerUrlComprobante(storagePath) }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'No se pudo abrir el comprobante.' }
  }
}
