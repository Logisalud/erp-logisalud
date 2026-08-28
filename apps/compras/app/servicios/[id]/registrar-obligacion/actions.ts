'use server'

import { redirect } from 'next/navigation'
import { registrarObligacionDesdeOS } from '@/services/servicios'
import { validarObligacionServicio, type BorradorObligacionServicio } from '@/domain/servicio'

export type EstadoFormulario = { errores: { campo: string; mensaje: string }[] } | null

export async function registrarObligacionServicioAction(
  osId: string,
  _previo: EstadoFormulario,
  form: FormData
): Promise<EstadoFormulario> {
  const borrador: BorradorObligacionServicio = {
    osId,
    numeroFactura: String(form.get('numeroFactura') ?? ''),
    fechaFactura: String(form.get('fechaFactura') ?? ''),
    tipoCambio: form.get('tipoCambio') ? Number(form.get('tipoCambio')) : null,
    baseImponible: Number(form.get('baseImponible') ?? 0),
    igv: Number(form.get('igv') ?? 0),
  }

  const errores = validarObligacionServicio(borrador)
  if (errores.length > 0) return { errores }

  let obligacion: { id: string }
  try {
    obligacion = await registrarObligacionDesdeOS(borrador)
  } catch (e) {
    return { errores: [{ campo: 'general', mensaje: (e as Error).message }] }
  }

  redirect(`/cuentas-por-pagar/${obligacion.id}`)
}
