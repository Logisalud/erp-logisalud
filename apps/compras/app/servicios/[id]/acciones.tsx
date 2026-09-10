'use client'

import { useState, useTransition } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { aprobarOSAction, rechazarOSAction, anularOSAction, type EstadoAccion } from './actions'
import { puedeAnularse, type EstadoOS } from '@/domain/servicio'

/** Un par de botones por estado, nunca los cuatro juntos — cada rol ve solo lo que le toca decidir ahora. */
export function AccionesOS({ osId, estado }: { osId: string; estado: EstadoOS }) {
  const [pending, startTransition] = useTransition()

  const ejecutar = (accion: (id: string) => Promise<{ error: string } | null>) =>
    startTransition(async () => {
      const resultado = await accion(osId)
      if (resultado?.error) alert(resultado.error)
    })

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {estado === 'pendiente_jefe' ? (
        <>
          <button type="button" disabled={pending} onClick={() => ejecutar(aprobarOSAction)} className="btn-primary">
            {pending ? 'Guardando…' : 'Aprobar (jefe de área)'}
          </button>
          <button type="button" disabled={pending} onClick={() => ejecutar(rechazarOSAction)} className="btn-secondary">
            Rechazar
          </button>
        </>
      ) : null}
      {puedeAnularse(estado) ? <BotonAnularOS osId={osId} /> : null}
    </div>
  )
}

/**
 * Anular por error de captura (Pieza D/K, sesión 2026-09-09) — distinto de
 * "Rechazar" (que es el jefe de área diciendo que no al servicio en sí):
 * esto es corregir un registro mal cargado, y por eso pide motivo y avisa a
 * Contabilidad por correo si la creación ya le había avisado.
 */
function BotonAnularOS({ osId }: { osId: string }) {
  const accion = anularOSAction.bind(null, osId)
  const [estadoForm, dispatch] = useFormState<EstadoAccion, FormData>(accion, null)
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
        Esto anula la orden de servicio por un error de captura — contá qué pasó, Contabilidad recibe un
        aviso con el motivo.
      </p>
      {estadoForm?.error ? <p className="text-sm text-red-700">{estadoForm.error}</p> : null}
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
