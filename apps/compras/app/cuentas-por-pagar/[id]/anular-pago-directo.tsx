'use client'

import { useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { anularPagoDirectoAction, type EstadoAccion } from './actions'

/**
 * Anular un Pago Directo por error de captura (Pieza D/K, sesión
 * 2026-09-09) — Mariela/Beatriz/Mily no tenían ninguna forma de rechazar un
 * pago directo ya registrado. Mismo patrón que el "Anular…" de OC/OS:
 * detrás de un botón secundario que revela el motivo obligatorio.
 */
export function BotonAnularPagoDirecto({ obligacionId }: { obligacionId: string }) {
  const accion = anularPagoDirectoAction.bind(null, obligacionId)
  const [estado, dispatch] = useFormState<EstadoAccion, FormData>(accion, null)
  const [abierto, setAbierto] = useState(false)

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} className="btn-secondary mt-4">
        Anular…
      </button>
    )
  }

  return (
    <form action={dispatch} className="card mt-4 w-full space-y-2 border-red-200">
      <p className="text-sm text-gray-700">
        Esto anula el pago directo por un error de captura — contá qué pasó, Contabilidad recibe un aviso
        con el motivo.
      </p>
      {estado?.error ? <p className="text-sm text-red-700">{estado.error}</p> : null}
      <textarea
        name="motivo" required rows={2} placeholder="Motivo de la anulación…"
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
      />
      <div className="flex gap-2">
        <BotonConfirmarAnulacion />
        <button type="button" onClick={() => setAbierto(false)} className="btn-secondary">
          Cancelar
        </button>
      </div>
    </form>
  )
}

function BotonConfirmarAnulacion() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
      {pending ? 'Anulando…' : 'Confirmar anulación'}
    </button>
  )
}
