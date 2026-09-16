'use client'

import { useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { advertenciaDeCambioDeMes } from '@/domain/correccion-fecha-pago'
import { hoyLima } from '@/domain/fecha'
import { corregirFechaPagoAction, type EstadoAccion } from './actions'

/**
 * Corregir la fecha de un pago ya registrado.
 *
 * Hermano de BotonReemplazarConstancia y deliberadamente NO el mismo
 * formulario: reemplazar un archivo es inerte para los números, cambiar la
 * fecha de pago reclasifica el pago entre periodos contables.
 *
 * De ahí la advertencia en vivo cuando la fecha elegida cae en otro mes: se
 * calcula mientras se escribe, con el monto adentro, porque ese es el caso
 * en que la corrección deja de ser un detalle y cambia dos cierres.
 */
export function BotonCorregirFechaPago({
  obligacionId, fechaActual, monto, moneda,
}: {
  obligacionId: string
  fechaActual: string
  monto: number
  moneda: string
}) {
  const conId = corregirFechaPagoAction.bind(null, obligacionId)
  const [estado, dispatch] = useFormState<EstadoAccion, FormData>(conId, null)
  const [abierto, setAbierto] = useState(false)
  const [fechaNueva, setFechaNueva] = useState(fechaActual)

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} className="btn-secondary mt-3">
        Corregir fecha del pago…
      </button>
    )
  }

  const aviso = advertenciaDeCambioDeMes({ fechaActual, fechaNueva, monto, moneda })

  return (
    <form action={dispatch} className="card mt-3 w-full space-y-3 border-amber-300">
      <p className="text-sm text-gray-700">
        Esto cambia <strong>solo la fecha del pago</strong>. El monto, el N° de operación, la
        cuenta y la constancia quedan exactamente como están. La fecha con la que se registró
        originalmente queda guardada.
      </p>
      {estado?.error ? <p className="text-sm text-red-700">{estado.error}</p> : null}

      <label className="block text-sm">
        <span className="font-medium text-gray-800">Fecha correcta del pago *</span>
        <input
          type="date" name="fechaNueva" required
          value={fechaNueva}
          onChange={(e) => setFechaNueva(e.target.value)}
          // El tope es HOY EN LIMA, no el del navegador ni el del servidor:
          // un pago no pudo ocurrir mañana, y con el "hoy" en UTC este
          // mismo campo rechazaba la fecha de hoy despues de las 19:00.
          max={hoyLima()}
          className="mt-1 min-h-12 w-full rounded-md border border-gray-300 px-3"
        />
        <span className="mt-1 block text-xs text-gray-500">
          Hoy dice {fechaActual.split('-').reverse().join('/')}.
        </span>
      </label>

      {/* La advertencia es lo que convierte esto en una decisión informada.
          No bloquea: mover un pago de mes es el caso legítimo típico. */}
      {aviso ? (
        <p className="rounded-md border border-amber-300 bg-amber-100 px-3 py-2.5 text-sm font-medium text-amber-950">
          ⚠️ {aviso}
        </p>
      ) : null}

      <label className="block text-sm">
        <span className="font-medium text-gray-800">¿Por qué la corriges? *</span>
        <textarea
          name="motivo" required rows={2}
          placeholder="Ej.: se registró con la fecha del día siguiente"
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
        />
        <span className="mt-1 block text-xs text-gray-500">
          Queda visible en la ficha junto a tu nombre y la fecha original.
        </span>
      </label>

      <div className="flex gap-2">
        <BotonConfirmar bloqueado={fechaNueva === fechaActual} />
        <button type="button" onClick={() => setAbierto(false)} className="btn-secondary">
          Cancelar
        </button>
      </div>
    </form>
  )
}

function BotonConfirmar({ bloqueado }: { bloqueado: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit" disabled={pending || bloqueado}
      className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
    >
      {pending ? 'Corrigiendo…' : 'Confirmar corrección'}
    </button>
  )
}
