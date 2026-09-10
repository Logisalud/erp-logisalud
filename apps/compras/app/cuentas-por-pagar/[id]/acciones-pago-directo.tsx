'use client'

import { useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { anularPagoDirectoAction, rechazarPagoDirectoAction, type EstadoAccion } from './actions'

/**
 * Las dos salidas hacia atrás de un Pago Directo. Se ven casi iguales a
 * propósito (un botón secundario que revela el motivo obligatorio, nunca una
 * acción de un solo clic), pero dicen cosas distintas:
 *
 *  - Anular: quien lo cargó se equivocó, el registro no debió existir.
 *  - Rechazar: Contabilidad lo revisó y lo devuelve — la contraparte de
 *    "Dar conformidad", y por eso aparece al lado de ese botón.
 */
export function BotonAnularPagoDirecto({ obligacionId }: { obligacionId: string }) {
  return (
    <CorteConMotivo
      obligacionId={obligacionId}
      accion={anularPagoDirectoAction}
      etiqueta="Anular…"
      explicacion="Esto anula el pago directo por un error de captura — contá qué pasó, Contabilidad recibe un aviso con el motivo."
      placeholder="Motivo de la anulación…"
      confirmar="Confirmar anulación"
      confirmando="Anulando…"
    />
  )
}

export function BotonRechazarPagoDirecto({ obligacionId }: { obligacionId: string }) {
  return (
    <CorteConMotivo
      obligacionId={obligacionId}
      accion={rechazarPagoDirectoAction}
      etiqueta="Rechazar…"
      explicacion="Esto devuelve el pago directo sin conformidad — contá qué está mal, quien lo registró recibe un aviso con el motivo."
      placeholder="Motivo del rechazo…"
      confirmar="Confirmar rechazo"
      confirmando="Rechazando…"
    />
  )
}

type AccionCorte = (obligacionId: string, previo: EstadoAccion, form: FormData) => Promise<EstadoAccion>

function CorteConMotivo({
  obligacionId, accion, etiqueta, explicacion, placeholder, confirmar, confirmando,
}: {
  obligacionId: string
  accion: AccionCorte
  etiqueta: string
  explicacion: string
  placeholder: string
  confirmar: string
  confirmando: string
}) {
  const conId = accion.bind(null, obligacionId)
  const [estado, dispatch] = useFormState<EstadoAccion, FormData>(conId, null)
  const [abierto, setAbierto] = useState(false)

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} className="btn-secondary mt-4">
        {etiqueta}
      </button>
    )
  }

  return (
    <form action={dispatch} className="card mt-4 w-full space-y-2 border-red-200">
      <p className="text-sm text-gray-700">{explicacion}</p>
      {estado?.error ? <p className="text-sm text-red-700">{estado.error}</p> : null}
      <textarea
        name="motivo" required rows={2} placeholder={placeholder}
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
      />
      <div className="flex gap-2">
        <BotonConfirmar texto={confirmar} textoEnviando={confirmando} />
        <button type="button" onClick={() => setAbierto(false)} className="btn-secondary">
          Cancelar
        </button>
      </div>
    </form>
  )
}

function BotonConfirmar({ texto, textoEnviando }: { texto: string; textoEnviando: string }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit" disabled={pending}
      className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
    >
      {pending ? textoEnviando : texto}
    </button>
  )
}
