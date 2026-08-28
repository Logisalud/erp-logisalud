'use server'

import { redirect } from 'next/navigation'
import { crearPropuesta } from '@/services/propuestas'

export type EstadoFormulario = { error: string } | null

export async function crearPropuestaAction(_previo: EstadoFormulario, form: FormData): Promise<EstadoFormulario> {
  const obligacionIds = form.getAll('obligacionId').map(String)

  let propuesta: { id: string }
  try {
    propuesta = await crearPropuesta(obligacionIds)
  } catch (e) {
    return { error: (e as Error).message }
  }

  redirect(`/cuentas-por-pagar/propuestas/${propuesta.id}`)
}
