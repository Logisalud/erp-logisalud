'use server'

import { revalidatePath } from 'next/cache'
import {
  crearCuentaBancariaEmpleado,
  eliminarCuentaBancariaEmpleado,
  type BorradorCuentaBancariaEmpleado,
} from '@/services/empleado-cuentas-bancarias'

export type EstadoFormulario = { error: string } | null

export async function crearCuentaBancariaAction(
  _previo: EstadoFormulario,
  form: FormData
): Promise<EstadoFormulario> {
  const tipoCuenta = String(form.get('tipoCuenta') ?? '')

  const borrador: BorradorCuentaBancariaEmpleado = {
    banco: String(form.get('banco') ?? ''),
    tipoCuenta: tipoCuenta === 'ahorros' || tipoCuenta === 'corriente' ? tipoCuenta : null,
    numeroCuenta: String(form.get('numeroCuenta') ?? ''),
    cci: String(form.get('cci') ?? ''),
    moneda: String(form.get('moneda') ?? 'PEN'),
    esPrincipal: form.get('esPrincipal') === 'on',
  }

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
