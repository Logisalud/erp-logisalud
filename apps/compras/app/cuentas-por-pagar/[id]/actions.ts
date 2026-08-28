'use server'

import { revalidatePath } from 'next/cache'
import { darConformidad, obtenerObligacion } from '@/services/obligaciones'
import { registrarNotaCredito, aplicarNotaCredito } from '@/services/notas-credito'

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
