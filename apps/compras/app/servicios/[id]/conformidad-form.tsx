'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { registrarConformidadAction, type EstadoAccion } from './actions'

export function FormularioConformidad({ osId }: { osId: string }) {
  const accionConDatos = registrarConformidadAction.bind(null, osId)
  const [estado, accion] = useFormState<EstadoAccion, FormData>(accionConDatos, null)

  return (
    <form action={accion} className="rounded-md border border-gray-200 p-3">
      {estado?.error ? <p className="mb-2 text-sm text-red-700">{estado.error}</p> : null}
      <label className="block text-sm">
        <span className="text-gray-600">Observaciones (opcional)</span>
        <textarea name="observaciones" rows={2} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
      </label>
      <div className="mt-3 flex gap-2">
        <Boton nombre="conforme" valor="true" clase="btn-primary" texto="El servicio se cumplió" />
        <Boton nombre="conforme" valor="false" clase="btn-secondary" texto="No se cumplió" />
      </div>
    </form>
  )
}

function Boton({ nombre, valor, clase, texto }: { nombre: string; valor: string; clase: string; texto: string }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" name={nombre} value={valor} disabled={pending} className={clase}>
      {pending ? 'Guardando…' : texto}
    </button>
  )
}
