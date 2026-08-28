'use server'

import { redirect } from 'next/navigation'
import { registrarMovimiento } from '@/services/caja-chica'
import { validarMovimiento, type BorradorMovimiento, type TipoComprobanteMovimiento } from '@/domain/caja-chica'

export type EstadoFormulario = { errores: { campo: string; mensaje: string }[] } | null

export async function registrarMovimientoAction(
  fondoId: string,
  _previo: EstadoFormulario,
  form: FormData
): Promise<EstadoFormulario> {
  const tipoComprobante = String(form.get('tipoComprobante') ?? 'boleta') as TipoComprobanteMovimiento
  const borrador: BorradorMovimiento = {
    fondoId,
    categoriaId: String(form.get('categoriaId') ?? ''),
    fecha: String(form.get('fecha') ?? ''),
    monto: Number(form.get('monto') ?? 0),
    tipoComprobante,
    numero: textoONull(form.get('numero')),
    rucEmisor: textoONull(form.get('rucEmisor')),
    placaVehiculo: textoONull(form.get('placaVehiculo')),
    descripcion: textoONull(form.get('descripcion')),
    baseImponible: tipoComprobante === 'sin_comprobante' ? null : Number(form.get('baseImponible') ?? 0),
    igv: tipoComprobante === 'sin_comprobante' ? null : Number(form.get('igv') ?? 0),
    sustentable: tipoComprobante !== 'sin_comprobante',
  }

  const errores = validarMovimiento(borrador)
  if (errores.length > 0) return { errores }

  const archivo = form.get('archivo')

  try {
    await registrarMovimiento(borrador, archivo instanceof File ? archivo : null)
  } catch (e) {
    return { errores: [{ campo: 'general', mensaje: (e as Error).message }] }
  }

  redirect(`/caja-chica/fondos/${fondoId}`)
}

function textoONull(v: FormDataEntryValue | null): string | null {
  const s = v == null ? '' : String(v).trim()
  return s === '' ? null : s
}
