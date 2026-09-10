'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { canjearPorLetrasAction, type EstadoFormulario } from './actions'
import { LetrasInput } from './letras-input'

export function FormularioCanje({ obligacionId, montoObligacion }: { obligacionId: string; montoObligacion: number }) {
  const accionConDatos = canjearPorLetrasAction.bind(null, obligacionId, montoObligacion)
  const [estado, accion] = useFormState<EstadoFormulario, FormData>(accionConDatos, null)
  const errorDe = (campo: string) => estado?.errores.find((e) => e.campo === campo)?.mensaje

  return (
    <form action={accion} className="space-y-4">
      {errorDe('general') ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900">{errorDe('general')}</p>
      ) : null}

      <section className="card">
        <p className="mb-3 text-sm text-gray-600">
          Las cuotas tienen que sumar exactamente lo mismo que se está partiendo — no es un gasto
          nuevo, es la misma deuda repartida en plazos. El N° de letra y el banco solo se llenan si
          de verdad hay una letra de cambio de por medio.
        </p>
        <LetrasInput montoObligacion={montoObligacion} error={errorDe('letras')} />
      </section>

      <BotonGuardar />
    </form>
  )
}

function BotonGuardar() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="btn-primary w-full sm:w-auto">
      {pending ? 'Guardando…' : 'Guardar el plan de cuotas'}
    </button>
  )
}
