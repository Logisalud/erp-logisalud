'use server'

import { revalidatePath } from 'next/cache'
import {
  crearCuentaBancariaProveedor,
  eliminarCuentaBancariaProveedor,
  type BorradorCuentaBancariaProveedor,
} from '@/services/proveedores'

export type EstadoFormularioCuenta = { error: string } | null

export async function crearCuentaBancariaProveedorAction(
  proveedorId: string,
  _previo: EstadoFormularioCuenta,
  form: FormData
): Promise<EstadoFormularioCuenta> {
  const tipoCuenta = String(form.get('tipoCuenta') ?? '')

  const borrador: BorradorCuentaBancariaProveedor = {
    banco: String(form.get('banco') ?? ''),
    tipoCuenta: tipoCuenta === 'ahorros' || tipoCuenta === 'corriente' ? tipoCuenta : null,
    numeroCuenta: String(form.get('numeroCuenta') ?? ''),
    cci: String(form.get('cci') ?? ''),
    moneda: String(form.get('moneda') ?? 'PEN'),
    titular: String(form.get('titular') ?? ''),
    esPrincipal: form.get('esPrincipal') === 'on',
  }

  try {
    await crearCuentaBancariaProveedor(proveedorId, borrador)
  } catch (e) {
    return { error: (e as Error).message }
  }

  revalidatePath(`/proveedores/${proveedorId}`)
  return null
}

export async function eliminarCuentaBancariaProveedorAction(proveedorId: string, id: string): Promise<void> {
  await eliminarCuentaBancariaProveedor(id)
  revalidatePath(`/proveedores/${proveedorId}`)
}
