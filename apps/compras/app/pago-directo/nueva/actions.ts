'use server'

import { redirect } from 'next/navigation'
import { validarPagoDirecto } from '@/domain/obligacion'
import { registrarPagoDirecto } from '@/services/obligaciones'

export type EstadoFormulario = { errores: { campo: string; mensaje: string }[] } | null

export async function registrarPagoDirectoAction(_previo: EstadoFormulario, form: FormData): Promise<EstadoFormulario> {
  const moneda = String(form.get('moneda') ?? 'PEN')
  const tipoCambioRaw = form.get('tipoCambio')

  const borrador = {
    proveedorId: String(form.get('proveedorId') ?? ''),
    categoriaId: String(form.get('categoriaId') ?? ''),
    descripcion: String(form.get('descripcion') ?? '').trim(),
    numeroFactura: String(form.get('numeroFactura') ?? '').trim(),
    fechaFactura: String(form.get('fechaFactura') ?? ''),
    moneda,
    tipoCambio: tipoCambioRaw ? Number(tipoCambioRaw) : null,
    baseImponible: Number(form.get('baseImponible') ?? 0),
    tasaDetraccionId: String(form.get('tasaDetraccionId') ?? '') || null,
    montoDetraccion: form.get('montoDetraccion') ? Number(form.get('montoDetraccion')) : null,
  }

  const errores = validarPagoDirecto(borrador)
  if (errores.length > 0) return { errores }

  let id: string
  try {
    const resultado = await registrarPagoDirecto(borrador)
    id = resultado.id
  } catch (e) {
    return { errores: [{ campo: 'general', mensaje: e instanceof Error ? e.message : 'No se pudo registrar el pago directo.' }] }
  }

  redirect(`/cuentas-por-pagar/${id}`)
}
