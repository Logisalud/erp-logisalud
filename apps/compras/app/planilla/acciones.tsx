'use client'

import { useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import {
  anularPagoPlanillaAction, darConformidadPlanillaAction, type EstadoAccion,
} from './actions'

/**
 * Dar conformidad es el paso que CREA la obligación — de ahí en adelante ya
 * es una deuda formal en camino a pagarse. Por eso confirma con el monto a
 * la vista y no es un clic suelto.
 */
export function BotonConformidadPlanilla({
  pagoId, resumen,
}: { pagoId: string; resumen: string }) {
  const conId = darConformidadPlanillaAction.bind(null, pagoId)
  const [estado, dispatch] = useFormState<EstadoAccion, FormData>(conId, null)
  const [abierto, setAbierto] = useState(false)

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} className="btn-primary">
        Dar conformidad
      </button>
    )
  }

  return (
    <form action={dispatch} className="card w-full space-y-2 border-logisalud-green">
      <p className="text-sm text-gray-700">
        Vas a generar la obligación de <strong>{resumen}</strong>. A partir de ahí entra al
        circuito normal: propuesta de pago, aprobación y desembolso de Tesorería.
      </p>
      {estado?.error ? <p className="text-sm text-red-700">{estado.error}</p> : null}
      <div className="flex gap-2">
        <BotonEnviar texto="Sí, dar conformidad" textoEnviando="Generando…" tono="verde" />
        <button type="button" onClick={() => setAbierto(false)} className="btn-secondary">
          Cancelar
        </button>
      </div>
    </form>
  )
}

/** Anular libera el par (periodo, quincena) para poder recargarlo bien — el
 * índice único es parcial justamente para eso. */
export function BotonAnularPlanilla({ pagoId }: { pagoId: string }) {
  const conId = anularPagoPlanillaAction.bind(null, pagoId)
  const [estado, dispatch] = useFormState<EstadoAccion, FormData>(conId, null)
  const [abierto, setAbierto] = useState(false)

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} className="btn-secondary">
        Anular…
      </button>
    )
  }

  return (
    <form action={dispatch} className="card w-full space-y-2 border-red-200">
      <p className="text-sm text-gray-700">
        La carga queda anulada y el periodo vuelve a quedar libre para cargarlo de nuevo. Cuenta
        qué pasó.
      </p>
      {estado?.error ? <p className="text-sm text-red-700">{estado.error}</p> : null}
      <textarea
        name="motivo" required rows={2} placeholder="Motivo de la anulación…"
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
      />
      <div className="flex gap-2">
        <BotonEnviar texto="Confirmar anulación" textoEnviando="Anulando…" tono="rojo" />
        <button type="button" onClick={() => setAbierto(false)} className="btn-secondary">
          Cancelar
        </button>
      </div>
    </form>
  )
}

function BotonEnviar({
  texto, textoEnviando, tono,
}: { texto: string; textoEnviando: string; tono: 'verde' | 'rojo' }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit" disabled={pending}
      className={`rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${
        tono === 'rojo' ? 'bg-red-600 hover:bg-red-700' : 'bg-logisalud-green hover:opacity-90'
      }`}
    >
      {pending ? textoEnviando : texto}
    </button>
  )
}
