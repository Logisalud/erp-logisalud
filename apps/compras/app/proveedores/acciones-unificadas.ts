'use server'

import { revalidatePath } from 'next/cache'
import {
  cambiarActivoProveedor,
  actualizarDatosProveedor,
  tieneMovimientos,
  crearCuentaBancariaUnificada,
  eliminarCuentaBancariaUnificada,
  type BorradorCuentaBancariaUnificada,
} from '@/services/proveedores-unificado'
import type { FuenteProveedor } from '@/domain/proveedor'

export type EstadoAccion = { error: string } | null

function ruta(fuente: FuenteProveedor, id: string) {
  return fuente === 'compra' ? `/proveedores/${id}` : `/proveedores/servicio/${id}`
}

/**
 * Desactivar es la única baja que existe (soft, nunca se borra un
 * proveedor con movimientos — Carta de Simplicidad: no se oculta la
 * consecuencia, si tiene OC/OS emitidas el mensaje lo dice). El
 * formulario ya le mostró el aviso antes de mandar `confirmado=true`
 * cuando hay movimientos — acá se revalida igual, nunca se confía solo en
 * lo que mandó el cliente.
 */
export async function cambiarActivoAction(
  fuente: FuenteProveedor,
  id: string,
  activo: boolean,
  confirmado: boolean
): Promise<EstadoAccion> {
  try {
    if (!activo) {
      const conMovimientos = await tieneMovimientos(fuente, id)
      if (conMovimientos && !confirmado) {
        return { error: 'Este proveedor ya tiene órdenes emitidas — confirmá que igual quieres desactivarlo.' }
      }
    }
    await cambiarActivoProveedor(fuente, id, activo)
  } catch (e) {
    return { error: (e as Error).message }
  }
  revalidatePath(ruta(fuente, id))
  revalidatePath('/proveedores')
  return null
}

export async function guardarDatosProveedorAction(
  fuente: FuenteProveedor,
  id: string,
  _previo: EstadoAccion,
  form: FormData
): Promise<EstadoAccion> {
  const direccionFiscal = String(form.get('direccionFiscal') ?? '').trim() || null
  const observaciones = String(form.get('observaciones') ?? '').trim() || null
  try {
    await actualizarDatosProveedor(fuente, id, { direccionFiscal, observaciones })
  } catch (e) {
    return { error: (e as Error).message }
  }
  revalidatePath(ruta(fuente, id))
  return null
}

export type EstadoFormularioCuenta = { error: string } | null

export async function crearCuentaBancariaAction(
  fuente: FuenteProveedor,
  proveedorId: string,
  _previo: EstadoFormularioCuenta,
  form: FormData
): Promise<EstadoFormularioCuenta> {
  const borrador: BorradorCuentaBancariaUnificada = {
    banco: String(form.get('banco') ?? ''),
    tipoCuenta: (form.get('tipoCuenta') as 'ahorros' | 'corriente') || null,
    numeroCuenta: String(form.get('numeroCuenta') ?? ''),
    cci: String(form.get('cci') ?? ''),
    moneda: String(form.get('moneda') ?? 'PEN'),
    titular: String(form.get('titular') ?? ''),
    esPrincipal: form.get('esPrincipal') === 'on',
  }
  try {
    await crearCuentaBancariaUnificada(fuente, proveedorId, borrador)
  } catch (e) {
    return { error: (e as Error).message }
  }
  revalidatePath(ruta(fuente, proveedorId))
  return null
}

export async function eliminarCuentaBancariaAction(fuente: FuenteProveedor, proveedorId: string, cuentaId: string): Promise<void> {
  await eliminarCuentaBancariaUnificada(fuente, cuentaId)
  revalidatePath(ruta(fuente, proveedorId))
}
