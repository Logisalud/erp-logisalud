'use server'

import { redirect } from 'next/navigation'
import { obtenerOS, registrarObligacionDesdeOS } from '@/services/servicios'
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
    tieneDetraccion: leerTieneDetraccion(form.get('tieneDetraccion')),
    porcentajeDetraccion: form.get('porcentajeDetraccion') ? Number(form.get('porcentajeDetraccion')) : null,
    montoDetraccion: form.get('montoDetraccion') ? Number(form.get('montoDetraccion')) : null,
  }

  const os = await obtenerOS(osId)
  const errores = validarObligacionServicio(
    borrador,
    os ? { montoEstimado: Number(os.monto_estimado), montoIncluyeIgv: os.monto_incluye_igv, moneda: os.moneda as 'PEN' | 'USD' } : undefined
  )
  if (errores.length > 0) return { errores }

  let obligacion: { id: string }
  try {
    obligacion = await registrarObligacionDesdeOS(borrador)
  } catch (e) {
    return { errores: [{ campo: 'general', mensaje: (e as Error).message }] }
  }

  redirect(`/cuentas-por-pagar/${obligacion.id}`)
}

/** `<input type="radio" name="tieneDetraccion" value="si"|"no">` — ver components/campo-detraccion.tsx. */
function leerTieneDetraccion(v: FormDataEntryValue | null): boolean | null {
  if (v === 'si') return true
  if (v === 'no') return false
  return null
}
