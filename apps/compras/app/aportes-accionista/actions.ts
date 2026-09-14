'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import {
  anularAporte, crearAporte, editarAporte, subirComprobanteAporte,
} from '@/services/aportes-accionista'
import { validarAporte, type BorradorAporte } from '@/domain/aporte-accionista'

export type EstadoFormulario = { errores: { campo: string; mensaje: string }[] } | null
export type EstadoAccion = { error: string } | null

function leerBorrador(form: FormData): BorradorAporte {
  return {
    fecha: String(form.get('fecha') ?? ''),
    categoriaId: textoONull(form.get('categoriaId')),
    categoriaLibre: textoONull(form.get('categoriaLibre')),
    descripcion: String(form.get('descripcion') ?? ''),
    moneda: String(form.get('moneda') ?? 'PEN'),
    monto: Number(form.get('monto') ?? 0),
  }
}

export async function crearAporteAction(
  _previo: EstadoFormulario,
  form: FormData
): Promise<EstadoFormulario> {
  const borrador = leerBorrador(form)
  const errores = validarAporte(borrador)
  if (errores.length > 0) return { errores }

  let aporte: { id: string; codigo: string }
  try {
    aporte = await crearAporte(borrador)
  } catch (e) {
    return { errores: [{ campo: 'general', mensaje: (e as Error).message }] }
  }

  // Best-effort, igual que el resto de los adjuntos del módulo: si la subida
  // falla, el aporte ya quedó registrado y el archivo se sube después.
  const archivo = form.get('comprobante')
  try {
    if (archivo instanceof File) await subirComprobanteAporte(aporte.id, archivo)
  } catch {
    // No tumbar el registro por un comprobante que falló.
  }

  revalidatePath('/aportes-accionista')
  redirect('/aportes-accionista')
}

export async function editarAporteAction(
  aporteId: string,
  _previo: EstadoFormulario,
  form: FormData
): Promise<EstadoFormulario> {
  const borrador = leerBorrador(form)
  const errores = validarAporte(borrador)
  if (errores.length > 0) return { errores }

  try {
    await editarAporte(aporteId, borrador)
  } catch (e) {
    return { errores: [{ campo: 'general', mensaje: (e as Error).message }] }
  }

  revalidatePath('/aportes-accionista')
  redirect('/aportes-accionista')
}

export async function anularAporteAction(
  aporteId: string,
  _previo: EstadoAccion,
  form: FormData
): Promise<EstadoAccion> {
  try {
    await anularAporte(aporteId, String(form.get('motivo') ?? ''))
  } catch (e) {
    return { error: (e as Error).message }
  }
  revalidatePath('/aportes-accionista')
  redirect('/aportes-accionista')
}

function textoONull(v: FormDataEntryValue | null): string | null {
  const s = v == null ? '' : String(v).trim()
  return s === '' ? null : s
}
