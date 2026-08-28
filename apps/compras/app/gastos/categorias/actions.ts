'use server'

import { revalidatePath } from 'next/cache'
import { crearCategoriaGasto } from '@/services/solicitudes-gasto'

export type EstadoFormulario = { errores: { campo: string; mensaje: string }[] } | null

export async function crearCategoriaAction(_previo: EstadoFormulario, form: FormData): Promise<EstadoFormulario> {
  const nombre = String(form.get('nombre') ?? '').trim()
  if (!nombre) return { errores: [{ campo: 'nombre', mensaje: 'Escribe un nombre.' }] }

  try {
    await crearCategoriaGasto(nombre, String(form.get('cuentaContable') ?? '').trim() || undefined)
  } catch (e) {
    return { errores: [{ campo: 'general', mensaje: e instanceof Error ? e.message : 'No se pudo crear la categoría.' }] }
  }

  revalidatePath('/gastos/categorias')
  revalidatePath('/gastos/nueva')
  return null
}
