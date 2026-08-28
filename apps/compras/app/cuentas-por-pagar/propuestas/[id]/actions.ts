'use server'

import { revalidatePath } from 'next/cache'
import { enviarAAprobacion, aprobarPropuesta, rechazarPropuesta } from '@/services/propuestas'
import { ejecutarPago, type BorradorPago } from '@/services/pagos'

export type EstadoAccion = { error: string } | null

async function ejecutar(propuestaId: string, fn: () => Promise<void>): Promise<EstadoAccion> {
  try {
    await fn()
  } catch (e) {
    return { error: (e as Error).message }
  }
  revalidatePath(`/cuentas-por-pagar/propuestas/${propuestaId}`)
  return null
}

export async function enviarAAprobacionAction(propuestaId: string): Promise<EstadoAccion> {
  return ejecutar(propuestaId, () => enviarAAprobacion(propuestaId))
}

export async function aprobarPropuestaAction(propuestaId: string): Promise<EstadoAccion> {
  return ejecutar(propuestaId, () => aprobarPropuesta(propuestaId))
}

export async function rechazarPropuestaAction(propuestaId: string): Promise<EstadoAccion> {
  return ejecutar(propuestaId, () => rechazarPropuesta(propuestaId))
}

export async function ejecutarPagoAction(
  propuestaId: string,
  _previo: EstadoAccion,
  form: FormData
): Promise<EstadoAccion> {
  const borrador: BorradorPago = {
    obligacionId: String(form.get('obligacionId') ?? ''),
    fechaPago: String(form.get('fechaPago') ?? ''),
    cuentaBancariaProveedorId: textoONull(form.get('cuentaBancariaProveedorId')),
    cuentaBancariaEmpleadoId: textoONull(form.get('cuentaBancariaEmpleadoId')),
    numeroVoucher: textoONull(form.get('numeroVoucher')),
    storagePathVoucher: null,
    storagePathDetraccion: null,
  }
  if (!borrador.fechaPago) return { error: 'Falta la fecha de pago.' }

  return ejecutar(propuestaId, async () => {
    await ejecutarPago(borrador)
  })
}

function textoONull(v: FormDataEntryValue | null): string | null {
  const s = v == null ? '' : String(v).trim()
  return s === '' ? null : s
}
