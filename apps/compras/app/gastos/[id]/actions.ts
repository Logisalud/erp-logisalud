'use server'

import { revalidatePath } from 'next/cache'
import {
  aprobarPorJefe, rechazarPorJefe, aprobarPorContabilidad, rechazarPorContabilidad,
  subirComprobante, liquidarAnticipo,
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

export async function aprobarPorJefeAction(id: string): Promise<EstadoAccion> {
  return ejecutar(id, () => aprobarPorJefe(id))
}

export async function rechazarPorJefeAction(id: string): Promise<EstadoAccion> {
  return ejecutar(id, () => rechazarPorJefe(id))
}

export async function aprobarPorContabilidadAction(id: string): Promise<EstadoAccion> {
  return ejecutar(id, () => aprobarPorContabilidad(id))
}

export async function rechazarPorContabilidadAction(id: string): Promise<EstadoAccion> {
  return ejecutar(id, () => rechazarPorContabilidad(id))
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

  if (!monto || monto <= 0) return { error: 'El monto del comprobante tiene que ser mayor a 0.' }

  return ejecutar(solicitudId, () =>
    subirComprobante({ solicitudId, fase, tipoComprobante, numero, rucEmisor, monto, sustentable })
  )
}

export async function liquidarAnticipoAction(id: string): Promise<EstadoAccion> {
  return ejecutar(id, () => liquidarAnticipo(id))
}

function textoONull(v: FormDataEntryValue | null): string | null {
  const s = v == null ? '' : String(v).trim()
  return s === '' ? null : s
}
