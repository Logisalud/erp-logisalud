'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import {
  anularPagoPlanilla, crearPagoPlanilla, darConformidadPlanilla, editarPagoPlanilla,
} from '@/services/planilla'
import { validarPagoPlanilla, type BorradorPagoPlanilla } from '@/domain/planilla'

export type EstadoFormulario = { errores: { campo: string; mensaje: string }[] } | null
export type EstadoAccion = { error: string } | null

function leerBorrador(form: FormData): BorradorPagoPlanilla {
  const concepto = String(form.get('concepto') ?? 'planilla')
  const esLbs = concepto === 'lbs'
  return {
    // Se pasa tal cual y lo rechaza `validarPagoPlanilla` si no es uno de los
    // dos: castearlo a 'planilla' por defecto escondería un formulario roto.
    concepto: concepto as BorradorPagoPlanilla['concepto'],
    periodo: String(form.get('periodo') ?? ''),
    // Cada concepto trae solo su campo; el del otro ni viaja en el form.
    secuencia: esLbs ? null : Number(form.get('secuencia') ?? 0),
    trabajador: esLbs ? String(form.get('trabajador') ?? '').trim() || null : null,
    monto: Number(form.get('monto') ?? 0),
    moneda: String(form.get('moneda') ?? 'PEN'),
    fechaPago: String(form.get('fechaPago') ?? ''),
  }
}

export async function crearPagoPlanillaAction(
  _previo: EstadoFormulario,
  form: FormData
): Promise<EstadoFormulario> {
  const borrador = leerBorrador(form)
  const errores = validarPagoPlanilla(borrador)
  if (errores.length > 0) return { errores }

  try {
    await crearPagoPlanilla(borrador)
  } catch (e) {
    return { errores: [{ campo: 'general', mensaje: (e as Error).message }] }
  }
  revalidatePath('/planilla')
  redirect('/planilla')
}

export async function editarPagoPlanillaAction(
  id: string,
  _previo: EstadoFormulario,
  form: FormData
): Promise<EstadoFormulario> {
  const borrador = leerBorrador(form)
  const errores = validarPagoPlanilla(borrador)
  if (errores.length > 0) return { errores }

  try {
    await editarPagoPlanilla(id, borrador)
  } catch (e) {
    return { errores: [{ campo: 'general', mensaje: (e as Error).message }] }
  }
  revalidatePath('/planilla')
  redirect('/planilla')
}

/** Acá nace la obligación y arranca el embudo normal de Cuentas por Pagar. */
export async function darConformidadPlanillaAction(
  id: string,
  _previo: EstadoAccion,
  _form: FormData
): Promise<EstadoAccion> {
  try {
    await darConformidadPlanilla(id)
  } catch (e) {
    return { error: (e as Error).message }
  }
  revalidatePath('/planilla')
  redirect('/planilla')
}

export async function anularPagoPlanillaAction(
  id: string,
  _previo: EstadoAccion,
  form: FormData
): Promise<EstadoAccion> {
  try {
    await anularPagoPlanilla(id, String(form.get('motivo') ?? ''))
  } catch (e) {
    return { error: (e as Error).message }
  }
  revalidatePath('/planilla')
  redirect('/planilla')
}
