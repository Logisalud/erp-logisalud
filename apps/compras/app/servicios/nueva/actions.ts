'use server'

import { redirect } from 'next/navigation'
import { crearOS } from '@/services/servicios'
import { validarOS, type BorradorOS } from '@/domain/servicio'

export type EstadoFormulario = { errores: { campo: string; mensaje: string }[] } | null

export async function crearOSAction(_previo: EstadoFormulario, form: FormData): Promise<EstadoFormulario> {
  const borrador: BorradorOS = {
    proveedorServicioId: String(form.get('proveedorServicioId') ?? ''),
    descripcionServicio: String(form.get('descripcionServicio') ?? ''),
    montoEstimado: Number(form.get('montoEstimado') ?? 0),
    montoIncluyeIgv: parsearBooleano(form.get('montoIncluyeIgv')),
    moneda: String(form.get('moneda') ?? 'PEN') as 'PEN' | 'USD',
    condicionesPagoDias: form.get('condicionesPagoDias') ? Number(form.get('condicionesPagoDias')) : null,
    fechaEntregaEstimada: textoONull(form.get('fechaEntregaEstimada')),
  }

  const errores = validarOS(borrador)
  if (errores.length > 0) return { errores }

  let os: { id: string }
  try {
    os = await crearOS(borrador)
  } catch (e) {
    return { errores: [{ campo: 'general', mensaje: (e as Error).message }] }
  }

  redirect(`/servicios/${os.id}`)
}

function textoONull(v: FormDataEntryValue | null): string | null {
  const s = v == null ? '' : String(v).trim()
  return s === '' ? null : s
}

function parsearBooleano(v: FormDataEntryValue | null): boolean | null {
  if (v === 'true') return true
  if (v === 'false') return false
  return null
}
