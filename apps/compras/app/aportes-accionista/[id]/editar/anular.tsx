'use client'

import { useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { anularAporteAction, type EstadoAccion } from '../../actions'

/**
 * Anular un aporte. Es borrado LÓGICO y por eso pide motivo: Contabilidad ya
 * pudo haberlo asentado en sus libros, y una fila que desaparece sin rastro
 * es lo que rompe una conciliación.
 */
export function BotonAnularAporte({ aporteId }: { aporteId: string }) {
  const conId = anularAporteAction.bind(null, aporteId)
  const [estado, dispatch] = useFormState<EstadoAccion, FormData>(conId, null)
  const [abierto, setAbierto] = useState(false)

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} className="btn-secondary mt-6">
        Anular…
      </button>
    )
  }

  return (
    <form action={dispatch} className="card mt-6 w-full space-y-2 border-red-200">
      <p className="text-sm text-gray-700">
        El aporte deja de contar en los totales, pero no se borra — Contabilidad puede haberlo
        asentado ya. Cuenta qué pasó.
      </p>
      {estado?.error ? <p className="text-sm text-red-700">{estado.error}</p> : null}
      <textarea
        name="motivo" required rows={2} placeholder="Motivo de la anulación…"
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
      />
      <div className="flex gap-2">
        <BotonConfirmar />
        <button type="button" onClick={() => setAbierto(false)} className="btn-secondary">
          Cancelar
        </button>
      </div>
    </form>
  )
}

function BotonConfirmar() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit" disabled={pending}
      className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
    >
      {pending ? 'Anulando…' : 'Confirmar anulación'}
    </button>
  )
}
