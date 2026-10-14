'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { actualizarPersonaAction, type EstadoFormulario } from '../actions'
import type { PersonaSinUsuario } from '@/services/beneficiarios'

export function FormularioPersona({ persona }: { persona: PersonaSinUsuario }) {
  const [estado, accion] = useFormState<EstadoFormulario, FormData>(
    actualizarPersonaAction.bind(null, persona.id),
    null,
  )
  return (
    <section className="card">
      <form action={accion} className="space-y-3">
        {estado?.error ? (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900">{estado.error}</p>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-sm sm:col-span-2">
            <span className="font-medium text-gray-800">Nombre y apellido</span>
            <input type="text" name="nombre" required defaultValue={persona.nombre} className="mt-1 min-h-12 w-full rounded-md border border-gray-300 px-3" />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-gray-800">DNI (opcional)</span>
            <input type="text" name="dni" inputMode="numeric" maxLength={8} defaultValue={persona.dni ?? ''} className="mt-1 min-h-12 w-full rounded-md border border-gray-300 px-3" />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="activo" defaultChecked={persona.activo} className="h-5 w-5" />
          Activo — aparece al armar un anticipo
        </label>
        <Boton />
      </form>
    </section>
  )
}

function Boton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="btn-secondary w-full sm:w-auto">
      {pending ? 'Guardando…' : 'Guardar cambios'}
    </button>
  )
}
