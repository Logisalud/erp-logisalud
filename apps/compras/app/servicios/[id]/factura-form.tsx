'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { subirFacturaAction, type EstadoAccion } from './actions'

export function FormularioFactura({ osId }: { osId: string }) {
  const accionConDatos = subirFacturaAction.bind(null, osId)
  const [estado, accion] = useFormState<EstadoAccion, FormData>(accionConDatos, null)

  return (
    <form action={accion} className="rounded-md border border-gray-200 p-3">
      {estado?.error ? <p className="mb-2 text-sm text-red-700">{estado.error}</p> : null}
      <label className="block text-sm">
        <span className="text-gray-600">Foto o PDF de la factura del proveedor</span>
        <input
          type="file" name="archivo" accept="application/pdf,image/jpeg,image/png,image/webp"
          className="mt-1 block w-full text-sm file:mr-3 file:min-h-12 file:rounded-md file:border-0 file:bg-logisalud-green file:px-3 file:text-white"
        />
      </label>
      <BotonSubir />
    </form>
  )
}

function BotonSubir() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="btn-secondary mt-3">
      {pending ? 'Subiendo…' : 'Subir factura'}
    </button>
  )
}
