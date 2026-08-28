'use server'

import { revalidatePath } from 'next/cache'
import { crearTipoImpuesto } from '@/services/impuestos'

export type EstadoFormulario = { errores: { campo: string; mensaje: string }[] } | null

export async function crearTipoImpuestoAction(_previo: EstadoFormulario, form: FormData): Promise<EstadoFormulario> {
  const nombre = String(form.get('nombre') ?? '').trim()
  if (!nombre) return { errores: [{ campo: 'nombre', mensaje: 'Escribí un nombre.' }] }

  try {
    await crearTipoImpuesto(nombre)
  } catch (e) {
    return { errores: [{ campo: 'general', mensaje: e instanceof Error ? e.message : 'No se pudo crear el tipo de impuesto.' }] }
  }

  revalidatePath('/impuestos/tipos')
  revalidatePath('/impuestos/nueva')
  return null
}
