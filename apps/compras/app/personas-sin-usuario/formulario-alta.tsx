'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { crearPersonaAction, type EstadoFormulario } from './actions'

export function FormularioAltaPersona() {
  const [estado, accion] = useFormState<EstadoFormulario, FormData>(crearPersonaAction, null)
  return (
    <section className="card">
      <h2 className="font-heading text-lg">Agregar persona</h2>
      <form action={accion} className="mt-3 space-y-3">
        {estado?.error ? (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900">{estado.error}</p>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-sm sm:col-span-2">
            <span className="font-medium text-gray-800">Nombre y apellido</span>
            <input type="text" name="nombre" required className="mt-1 min-h-12 w-full rounded-md border border-gray-300 px-3" />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-gray-800">DNI (opcional)</span>
            <input type="text" name="dni" inputMode="numeric" maxLength={8} className="mt-1 min-h-12 w-full rounded-md border border-gray-300 px-3" />
          </label>
        </div>
        <Boton />
      </form>
    </section>
  )
}

function Boton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="btn-primary w-full sm:w-auto">
      {pending ? 'Agregando…' : 'Agregar'}
    </button>
  )
}
