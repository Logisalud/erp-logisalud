'use client'

import { useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { resolverDiscrepanciaAction, type EstadoResolucion } from './actions'

const OPCIONES_ACCION = [
  { valor: 'aceptado_segun_sugerencia', etiqueta: 'Aceptar según lo sugerido' },
  { valor: 'aceptado_con_ajuste', etiqueta: 'Aceptar con otra cantidad' },
  { valor: 'rechazado', etiqueta: 'Rechazar todo' },
  { valor: 'nota_credito_solicitada', etiqueta: 'Pedir nota de crédito' },
  { valor: 'reposicion_solicitada', etiqueta: 'Pedir reposición' },
] as const

/**
 * El responsable de Almacén confirma o ajusta la línea con discrepancia. Un
 * solo botón primario ("Guardar decisión") por línea — las opciones se
 * eligen antes, no son 5 botones distintos.
 */
export function ResolucionDiscrepancia({
  recepcionId, recepcionItemId, cantidadFisica, cantidadSugerida,
}: { recepcionId: string; recepcionItemId: string; cantidadFisica: number; cantidadSugerida: number }) {
  const accionConRecepcion = resolverDiscrepanciaAction.bind(null, recepcionId)
  const [estado, accion] = useFormState<EstadoResolucion, FormData>(accionConRecepcion, null)
  const [accionTomada, setAccionTomada] = useState<(typeof OPCIONES_ACCION)[number]['valor']>(
    'aceptado_segun_sugerencia'
  )

  return (
    <form action={accion} className="space-y-2">
      <input type="hidden" name="recepcionItemId" value={recepcionItemId} />

      {estado?.error ? <p className="text-sm text-red-700">{estado.error}</p> : null}

      <label className="block text-sm">
        <span className="text-gray-700">Decisión</span>
        <select
          name="accionTomada"
          value={accionTomada}
          onChange={(e) => setAccionTomada(e.target.value as typeof accionTomada)}
          className="mt-1 min-h-12 w-full rounded-md border border-gray-300 bg-white px-3"
        >
          {OPCIONES_ACCION.map((o) => (
            <option key={o.valor} value={o.valor}>{o.etiqueta}</option>
          ))}
        </select>
      </label>

      {accionTomada === 'aceptado_con_ajuste' ? (
        <label className="block text-sm">
          <span className="text-gray-700">Cantidad a aceptar (de {cantidadFisica} física)</span>
          <input
            type="number" name="cantidadAceptadaAjustada"
            min={0} max={cantidadFisica} step="any"
            defaultValue={cantidadSugerida}
            className="mt-1 min-h-12 w-full rounded-md border border-gray-300 px-3"
          />
        </label>
      ) : null}

      <label className="block text-sm">
        <span className="text-gray-700">Comentario (opcional)</span>
        <input
          type="text" name="comentario"
          className="mt-1 min-h-12 w-full rounded-md border border-gray-300 px-3"
        />
      </label>

      <BotonGuardar />
    </form>
  )
}

function BotonGuardar() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="btn-secondary">
      {pending ? 'Guardando…' : 'Guardar decisión'}
    </button>
  )
}
