'use server'

import { redirect } from 'next/navigation'
import { crearPrestamo } from '@/services/financiamiento'
import { validarPrestamo, type BorradorCuota, type BorradorPrestamo } from '@/domain/financiamiento'

export type EstadoFormulario = { errores: { campo: string; mensaje: string }[] } | null

export async function crearPrestamoAction(_previo: EstadoFormulario, form: FormData): Promise<EstadoFormulario> {
  const cuotas = parsearCuotas(form.get('cuotasJson'))

  const borrador: BorradorPrestamo = {
    entidadFinanciera: String(form.get('entidadFinanciera') ?? ''),
    numeroPrestamo: textoONull(form.get('numeroPrestamo')),
    montoOriginal: Number(form.get('montoOriginal') ?? 0),
    moneda: String(form.get('moneda') ?? 'PEN') as 'PEN' | 'USD',
    tasaInteresAnual: form.get('tasaInteresAnual') ? Number(form.get('tasaInteresAnual')) : null,
    fechaDesembolso: textoONull(form.get('fechaDesembolso')),
    cuotas,
  }

  const errores = validarPrestamo(borrador)
  if (errores.length > 0) return { errores }

  let prestamo: { id: string }
  try {
    prestamo = await crearPrestamo(borrador)
  } catch (e) {
    return { errores: [{ campo: 'general', mensaje: (e as Error).message }] }
  }

  redirect(`/financiamiento/prestamos/${prestamo.id}`)
}

function parsearCuotas(raw: FormDataEntryValue | null): BorradorCuota[] {
  if (!raw) return []
  try {
    const filas = JSON.parse(String(raw)) as { numeroCuota: number; fechaVencimiento: string; montoCapital: string; montoInteres: string }[]
    return filas.map((f) => ({
      numeroCuota: Number(f.numeroCuota),
      fechaVencimiento: f.fechaVencimiento,
      montoCapital: Number(f.montoCapital) || 0,
      montoInteres: Number(f.montoInteres) || 0,
    }))
  } catch {
    return []
  }
}

function textoONull(v: FormDataEntryValue | null): string | null {
  const s = v == null ? '' : String(v).trim()
  return s === '' ? null : s
}
