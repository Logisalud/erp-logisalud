'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { crearTipoImpuestoAction, type EstadoFormulario } from './actions'

export function FormularioTipoImpuesto() {
  const [estado, accion] = useFormState<EstadoFormulario, FormData>(crearTipoImpuestoAction, null)
  const errorDe = (campo: string) => estado?.errores.find((e) => e.campo === campo)?.mensaje

  return (
    <form action={accion} className="card space-y-3">
      {errorDe('general') ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900">
          {errorDe('general')}
        </p>
      ) : null}

      <label className="block text-sm">
        <span className="font-medium text-gray-800">Nombre</span>
        <input
          type="text" name="nombre" required
          className="mt-1 min-h-12 w-full rounded-md border border-gray-300 px-3"
        />
        {errorDe('nombre') ? <p className="mt-1 text-red-700">{errorDe('nombre')}</p> : null}
      </label>

      <BotonGuardar />
    </form>
  )
}

function BotonGuardar() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="btn-primary w-full sm:w-auto">
      {pending ? 'Guardando…' : 'Agregar tipo de impuesto'}
    </button>
  )
}
