'use server'

import { redirect } from 'next/navigation'
import { cargarObligacionTributaria } from '@/services/impuestos'
import { validarImpuesto, type BorradorImpuesto } from '@/domain/impuestos'

export type EstadoFormulario = { errores: { campo: string; mensaje: string }[] } | null

export async function cargarObligacionTributariaAction(_previo: EstadoFormulario, form: FormData): Promise<EstadoFormulario> {
  const borrador: BorradorImpuesto = {
    tipoImpuestoId: String(form.get('tipoImpuestoId') ?? ''),
    periodo: String(form.get('periodo') ?? ''),
    monto: Number(form.get('monto') ?? 0),
    fechaVencimiento: String(form.get('fechaVencimiento') ?? ''),
    fuente: String(form.get('fuente') ?? 'BUK') as 'BUK' | 'SUNAT' | 'manual',
  }

  const errores = validarImpuesto(borrador)
  if (errores.length > 0) return { errores }

  try {
    await cargarObligacionTributaria(borrador)
  } catch (e) {
    return { errores: [{ campo: 'general', mensaje: (e as Error).message }] }
  }

  redirect('/impuestos')
}
