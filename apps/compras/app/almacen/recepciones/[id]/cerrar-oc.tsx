'use client'

import { useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { cerrarOCDesdeRecepcionAction, type EstadoCierre } from './actions'

/**
 * Cerrar la orden con saldo pendiente, desde la recepción.
 *
 * Vive acá y no antes de recibir (2026-09-18): cerrar es una decisión que se
 * toma cuando ya se sabe qué llegó. Charlie puede cerrarla sin recibir el
 * saldo —el proveedor no siempre completa, y obligarlo a "recibir" lo que no
 * llegó sería falsear el dato— y lo único que se le pide es que confirme
 * viendo exactamente qué está dejando afuera.
 *
 * El motivo se mantiene obligatorio porque el servicio ya lo exige desde la
 * migración 0030, y es la diferencia entre una orden "cerrada" y una
 * "cerrada porque el proveedor discontinuó el producto".
 */
export function BotonCerrarOCDesdeRecepcion({
  ocId, ocCodigo, detalle,
}: {
  ocId: string
  ocCodigo: string
  detalle: { producto: string; porRecibir: number }[]
}) {
  const conId = cerrarOCDesdeRecepcionAction.bind(null, ocId)
  const [estado, accion] = useFormState<EstadoCierre, FormData>(conId, null)
  const [abierto, setAbierto] = useState(false)

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} className="btn-secondary mt-3">
        Cerrar la orden {ocCodigo}…
      </button>
    )
  }

  return (
    <form action={accion} className="mt-3 space-y-3 rounded-md border border-amber-300 bg-amber-50 p-3">
      <p className="text-sm font-medium text-amber-950">
        ¿Seguro que querés cerrar {ocCodigo}? Esto deja sin recibir:
      </p>
      {/* El desglose exacto, no "hay saldo pendiente": es lo que permite
          decidir. Regla 7 de la Carta de Simplicidad. */}
      <ul className="text-sm text-amber-900">
        {detalle.map((d) => (
          <li key={d.producto}>• {d.porRecibir} × {d.producto}</li>
        ))}
      </ul>
      <p className="text-xs text-amber-900">
        Una orden cerrada no admite recepciones nuevas. Si el proveedor todavía puede
        entregar, mejor esperá la próxima guía.
      </p>

      {estado?.error ? <p className="text-sm text-red-700">{estado.error}</p> : null}

      <label className="block text-sm">
        <span className="font-medium text-gray-800">¿Por qué se cierra? *</span>
        <textarea
          name="motivo" required rows={2}
          placeholder="Ej.: el proveedor discontinuó el producto"
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
        />
      </label>

      <div className="flex flex-wrap gap-2">
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
      className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
    >
      {pending ? 'Cerrando…' : 'Cerrar de todos modos'}
    </button>
  )
}
