'use server'

import { redirect } from 'next/navigation'
import { crearSolicitud } from '@/services/solicitudes-gasto'
import { validarSolicitud, type BorradorSolicitud } from '@/domain/gasto'

export type EstadoFormulario = { errores: { campo: string; mensaje: string }[] } | null

export async function crearSolicitudAction(_previo: EstadoFormulario, form: FormData): Promise<EstadoFormulario> {
  const borrador: BorradorSolicitud = {
    tipo: String(form.get('tipo') ?? 'gasto_directo') as BorradorSolicitud['tipo'],
    categoriaId: String(form.get('categoriaId') ?? ''),
    moneda: String(form.get('moneda') ?? 'PEN'),
    montoSolicitado: Number(form.get('montoSolicitado') ?? 0),
    descripcion: String(form.get('descripcion') ?? ''),
    destino: textoONull(form.get('destino')),
    fechaInicio: textoONull(form.get('fechaInicio')),
    fechaFin: textoONull(form.get('fechaFin')),
  }

  const errores = validarSolicitud(borrador)
  if (errores.length > 0) return { errores }

  let solicitud: { id: string }
  try {
    solicitud = await crearSolicitud(borrador)
  } catch (e) {
    return { errores: [{ campo: 'general', mensaje: (e as Error).message }] }
  }

  redirect(`/gastos/${solicitud.id}`)
}

function textoONull(v: FormDataEntryValue | null): string | null {
  const s = v == null ? '' : String(v).trim()
  return s === '' ? null : s
}
