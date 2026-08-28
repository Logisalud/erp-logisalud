'use server'

import { redirect } from 'next/navigation'
import { canjearPorLetras } from '@/services/financiamiento'
import { validarLetras, type BorradorLetra } from '@/domain/financiamiento'

export type EstadoFormulario = { errores: { campo: string; mensaje: string }[] } | null

export async function canjearPorLetrasAction(
  obligacionId: string,
  montoObligacion: number,
  _previo: EstadoFormulario,
  form: FormData
): Promise<EstadoFormulario> {
  const letras = parsearLetras(form.get('letrasJson'))

  const errores = validarLetras(letras, montoObligacion)
  if (errores.length > 0) return { errores }

  try {
    await canjearPorLetras(obligacionId, letras)
  } catch (e) {
    return { errores: [{ campo: 'general', mensaje: (e as Error).message }] }
  }

  redirect(`/cuentas-por-pagar/${obligacionId}`)
}

function parsearLetras(raw: FormDataEntryValue | null): BorradorLetra[] {
  if (!raw) return []
  try {
    const filas = JSON.parse(String(raw)) as { numero: string; monto: string; fechaVencimiento: string; bancoNegociacion: string }[]
    return filas.map((f) => ({
      numero: f.numero?.trim() || null,
      monto: Number(f.monto) || 0,
      fechaVencimiento: f.fechaVencimiento,
      bancoNegociacion: f.bancoNegociacion?.trim() || null,
    }))
  } catch {
    return []
  }
}
