'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import {
  actualizarPersonaSinUsuario,
  crearPersonaSinUsuario,
  puedeAdministrarPersonas,
} from '@/services/beneficiarios'
import {
  crearCuentaBancariaEmpleado,
  eliminarCuentaBancariaEmpleado,
} from '@/services/empleado-cuentas-bancarias'
import { cuentaBancariaDeFormulario } from '@/lib/form-cuenta-bancaria'

export type EstadoFormulario = { error: string } | null

const NO_AUTORIZADO = 'Solo Contabilidad puede mantener esta lista.'

export async function crearPersonaAction(_previo: EstadoFormulario, form: FormData): Promise<EstadoFormulario> {
  if (!(await puedeAdministrarPersonas())) return { error: NO_AUTORIZADO }
  let id: string
  try {
    ;({ id } = await crearPersonaSinUsuario({
      nombre: String(form.get('nombre') ?? ''),
      dni: String(form.get('dni') ?? ''),
    }))
  } catch (e) {
    return { error: (e as Error).message }
  }
  revalidatePath('/personas-sin-usuario')
  // Directo a su ficha: lo siguiente que hace falta es su cuenta bancaria.
  redirect(`/personas-sin-usuario/${id}`)
}

export async function actualizarPersonaAction(
  id: string,
  _previo: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  if (!(await puedeAdministrarPersonas())) return { error: NO_AUTORIZADO }
  try {
    await actualizarPersonaSinUsuario(id, {
      nombre: String(form.get('nombre') ?? ''),
      dni: String(form.get('dni') ?? ''),
      activo: form.get('activo') === 'on',
    })
  } catch (e) {
    return { error: (e as Error).message }
  }
  revalidatePath('/personas-sin-usuario')
  revalidatePath(`/personas-sin-usuario/${id}`)
  return null
}

export async function crearCuentaPersonaAction(
  personaId: string,
  _previo: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  if (!(await puedeAdministrarPersonas())) return { error: NO_AUTORIZADO }
  try {
    await crearCuentaBancariaEmpleado(cuentaBancariaDeFormulario(form), { personaSinUsuarioId: personaId })
  } catch (e) {
    return { error: (e as Error).message }
  }
  revalidatePath(`/personas-sin-usuario/${personaId}`)
  revalidatePath('/personas-sin-usuario')
  return null
}

export async function eliminarCuentaPersonaAction(personaId: string, cuentaId: string): Promise<void> {
  if (!(await puedeAdministrarPersonas())) throw new Error(NO_AUTORIZADO)
  await eliminarCuentaBancariaEmpleado(cuentaId, { personaSinUsuarioId: personaId })
  revalidatePath(`/personas-sin-usuario/${personaId}`)
  revalidatePath('/personas-sin-usuario')
}
