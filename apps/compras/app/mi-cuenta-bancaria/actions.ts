'use server'

import { revalidatePath } from 'next/cache'
import {
  crearCuentaBancariaEmpleado,
  eliminarCuentaBancariaEmpleado,
} from '@/services/empleado-cuentas-bancarias'
import { cuentaBancariaDeFormulario } from '@/lib/form-cuenta-bancaria'

export type EstadoFormulario = { error: string } | null

export async function crearCuentaBancariaAction(
  _previo: EstadoFormulario,
  form: FormData
): Promise<EstadoFormulario> {
  const borrador = cuentaBancariaDeFormulario(form)

  try {
    await crearCuentaBancariaEmpleado(borrador)
  } catch (e) {
    return { error: (e as Error).message }
  }

  revalidatePath('/mi-cuenta-bancaria')
  return null
}

export async function eliminarCuentaBancariaAction(id: string): Promise<void> {
  await eliminarCuentaBancariaEmpleado(id)
  revalidatePath('/mi-cuenta-bancaria')
}
