'use server'

import { revalidatePath } from 'next/cache'
import { anularConstancia, registrarConstancia, urlConstancia } from '@/services/retencion-4ta'
import type { FuenteProveedor } from '@/domain/proveedor'

export type EstadoConstancia = { error: string } | { ok: true } | null

const rutaFicha = (fuente: FuenteProveedor, id: string) =>
  fuente === 'servicio' ? `/proveedores/servicio/${id}` : `/proveedores/${id}`

export async function registrarConstanciaAction(
  fuente: FuenteProveedor,
  proveedorId: string,
  _previo: EstadoConstancia,
  form: FormData,
): Promise<EstadoConstancia> {
  const archivo = form.get('archivo')
  try {
    await registrarConstancia({
      fuente,
      proveedorId,
      numero: String(form.get('numero') ?? ''),
      fechaEmision: String(form.get('fechaEmision') ?? ''),
      archivo: archivo instanceof File ? archivo : (null as unknown as File),
    })
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'No se pudo registrar la constancia.' }
  }
  revalidatePath(rutaFicha(fuente, proveedorId))
  return { ok: true }
}

export async function anularConstanciaAction(
  fuente: FuenteProveedor,
  proveedorId: string,
  constanciaId: string,
  form: FormData,
): Promise<void> {
  await anularConstancia(constanciaId, String(form.get('motivo') ?? ''))
  revalidatePath(rutaFicha(fuente, proveedorId))
}

export async function verConstanciaAction(storagePath: string): Promise<string | null> {
  return urlConstancia(storagePath)
}
