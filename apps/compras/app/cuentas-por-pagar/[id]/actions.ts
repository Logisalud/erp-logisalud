'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import {
  darConformidad, anularPagoDirecto, rechazarPagoDirecto,
  obtenerObligacion, obtenerUrlLegajoPagoDirecto,
} from '@/services/obligaciones'
import { registrarNotaCredito, aplicarNotaCredito } from '@/services/notas-credito'
import { obtenerUrlLegajoPago } from '@/services/pagos'
import { registrarPagoHistorico, subirVoucherHistorico } from '@/services/pago-historico'

export type EstadoAccion = { error: string } | null

export async function darConformidadAction(obligacionId: string): Promise<EstadoAccion> {
  try {
    await darConformidad(obligacionId)
  } catch (e) {
    return { error: (e as Error).message }
  }
  revalidatePath(`/cuentas-por-pagar/${obligacionId}`)
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
  revalidatePath(`/cuentas-por-pagar/${obligacionId}`)
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
  revalidatePath(`/cuentas-por-pagar/${obligacionId}`)
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
  revalidatePath(`/cuentas-por-pagar/${obligacionId}`)
  return null
}

export async function aplicarNotaCreditoAction(obligacionId: string, notaCreditoId: string): Promise<EstadoAccion> {
  try {
    await aplicarNotaCredito(notaCreditoId)
  } catch (e) {
    return { error: (e as Error).message }
  }
  revalidatePath(`/cuentas-por-pagar/${obligacionId}`)
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
  revalidatePath(`/cuentas-por-pagar/${obligacionId}`)
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
