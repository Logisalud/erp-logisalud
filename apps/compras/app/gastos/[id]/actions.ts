'use server'

import { revalidatePath } from 'next/cache'
import {
  aprobarPorContabilidad, rechazarPorContabilidad,
  subirComprobante, liquidarAnticipo, obtenerUrlComprobante, anularSolicitud,
} from '@/services/solicitudes-gasto'

export type EstadoAccion = { error: string } | null

async function ejecutar(solicitudId: string, fn: () => Promise<void>): Promise<EstadoAccion> {
  try {
    await fn()
  } catch (e) {
    return { error: (e as Error).message }
  }
  revalidatePath(`/gastos/${solicitudId}`)
  return null
}

export async function aprobarPorContabilidadAction(id: string): Promise<EstadoAccion> {
  return ejecutar(id, () => aprobarPorContabilidad(id))
}

export async function rechazarPorContabilidadAction(
  id: string,
  _previo: EstadoAccion,
  form: FormData
): Promise<EstadoAccion> {
  const motivo = String(form.get('motivo') ?? '')
  return ejecutar(id, () => rechazarPorContabilidad(id, motivo))
}

export async function subirComprobanteAction(
  solicitudId: string,
  fase: 'inicial' | 'rendicion',
  _previo: EstadoAccion,
  form: FormData
): Promise<EstadoAccion> {
  const monto = Number(form.get('monto') ?? 0)
  const tipoComprobante = String(form.get('tipoComprobante') ?? 'boleta') as 'factura' | 'boleta' | 'sin_comprobante'
  const numero = textoONull(form.get('numero'))
  const rucEmisor = textoONull(form.get('rucEmisor'))
  const sustentable = form.get('sustentable') === 'true'
  const archivo = form.get('archivo')

  if (!monto || monto <= 0) return { error: 'El monto del comprobante tiene que ser mayor a 0.' }

  return ejecutar(solicitudId, () =>
    subirComprobante({
      solicitudId, fase, tipoComprobante, numero, rucEmisor, monto, sustentable,
      archivo: archivo instanceof File ? archivo : null,
    })
  )
}

export async function verComprobanteAction(storagePath: string): Promise<{ url: string } | { error: string }> {
  try {
    const url = await obtenerUrlComprobante(storagePath)
    return { url }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

export async function liquidarAnticipoAction(id: string): Promise<EstadoAccion> {
  return ejecutar(id, () => liquidarAnticipo(id))
}

export async function anularSolicitudAction(
  id: string,
  _previo: EstadoAccion,
  form: FormData
): Promise<EstadoAccion> {
  const motivo = String(form.get('motivo') ?? '')
  return ejecutar(id, () => anularSolicitud(id, motivo))
}

function textoONull(v: FormDataEntryValue | null): string | null {
  const s = v == null ? '' : String(v).trim()
  return s === '' ? null : s
}
