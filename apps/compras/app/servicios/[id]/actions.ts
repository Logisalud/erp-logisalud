'use server'

import { revalidatePath } from 'next/cache'
import {
  aprobarOS, rechazarOS, subirFacturaOS, registrarConformidad, obtenerUrlFacturaOS,
} from '@/services/servicios'

export type EstadoAccion = { error: string } | null

async function ejecutar(osId: string, fn: () => Promise<void>): Promise<EstadoAccion> {
  try {
    await fn()
  } catch (e) {
    return { error: (e as Error).message }
  }
  revalidatePath(`/servicios/${osId}`)
  revalidatePath('/servicios')
  return null
}

export async function aprobarOSAction(id: string): Promise<EstadoAccion> {
  return ejecutar(id, () => aprobarOS(id))
}

export async function rechazarOSAction(id: string): Promise<EstadoAccion> {
  return ejecutar(id, () => rechazarOS(id))
}

export async function subirFacturaAction(osId: string, _previo: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  const archivo = form.get('archivo')
  if (!(archivo instanceof File) || archivo.size === 0) return { error: 'Elegí un archivo primero.' }
  return ejecutar(osId, () => subirFacturaOS(osId, archivo))
}

export async function registrarConformidadAction(osId: string, _previo: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  const conforme = form.get('conforme') === 'true'
  const observaciones = String(form.get('observaciones') ?? '').trim() || null
  return ejecutar(osId, () => registrarConformidad(osId, conforme, observaciones))
}

export async function verFacturaAction(storagePath: string): Promise<{ url: string } | { error: string }> {
  try {
    const url = await obtenerUrlFacturaOS(storagePath)
    return { url }
  } catch (e) {
    return { error: (e as Error).message }
  }
}
