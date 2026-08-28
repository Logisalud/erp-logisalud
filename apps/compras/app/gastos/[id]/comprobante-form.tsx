'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { subirComprobanteAction, type EstadoAccion } from './actions'

export function FormularioComprobante({
  solicitudId, fase,
}: { solicitudId: string; fase: 'inicial' | 'rendicion' }) {
  const accionConDatos = subirComprobanteAction.bind(null, solicitudId, fase)
  const [estado, accion] = useFormState<EstadoAccion, FormData>(accionConDatos, null)

  return (
    <form action={accion} className="rounded-md border border-gray-200 p-3">
      {estado?.error ? <p className="mb-2 text-sm text-red-700">{estado.error}</p> : null}
      <label className="mb-3 block text-sm">
        <span className="text-gray-600">Foto o PDF del comprobante</span>
        <input
          type="file" name="archivo" accept="application/pdf,image/jpeg,image/png,image/webp"
          className="mt-1 block w-full text-sm file:mr-3 file:min-h-12 file:rounded-md file:border-0 file:bg-logisalud-green file:px-3 file:text-white"
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="text-gray-600">Tipo</span>
          <select name="tipoComprobante" defaultValue="boleta" className="mt-1 min-h-12 w-full rounded-md border border-gray-300 bg-white px-3">
            <option value="factura">Factura</option>
            <option value="boleta">Boleta</option>
            <option value="sin_comprobante">Sin comprobante</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-gray-600">Monto</span>
          <input type="number" name="monto" min="0" step="0.01" className="mt-1 min-h-12 w-full rounded-md border border-gray-300 px-3" />
        </label>
        <label className="block text-sm">
          <span className="text-gray-600">N° (opcional)</span>
          <input type="text" name="numero" className="mt-1 min-h-12 w-full rounded-md border border-gray-300 px-3" />
        </label>
        <label className="block text-sm">
          <span className="text-gray-600">RUC emisor (opcional)</span>
          <input type="text" name="rucEmisor" className="mt-1 min-h-12 w-full rounded-md border border-gray-300 px-3" />
        </label>
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm">
        <input type="checkbox" name="sustentable" value="true" defaultChecked />
        Es un comprobante válido para sustentar el gasto
      </label>
      <BotonSubir />
    </form>
  )
}

function BotonSubir() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="btn-secondary mt-3">
      {pending ? 'Guardando…' : 'Agregar comprobante'}
    </button>
  )
}
