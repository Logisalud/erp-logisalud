'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { aprobarExcepcionAction, type EstadoAccion } from './actions'

/** "Aprobar el monto verificado" reconoce la excepción — la obligación YA
 * se creó por ese monto desde que conciliò (regla de negocio 5), esto no
 * mueve plata, solo saca la fila de la bandeja de revisión. "Dejar
 * pendiente" es no hacer nada — la fila se queda ahí para revisarla después. */
export function AccionExcepcion({ facturaPendienteId }: { facturaPendienteId: string }) {
  const accion = aprobarExcepcionAction.bind(null, facturaPendienteId)
  const [estado, dispatch] = useFormState<EstadoAccion, FormData>(accion, null)
  return (
    <form action={dispatch}>
      {estado?.error ? <p className="mb-1 text-xs text-red-700">{estado.error}</p> : null}
      <Boton />
    </form>
  )
}

function Boton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="btn-secondary whitespace-nowrap">
      {pending ? 'Guardando…' : 'Aprobar monto verificado'}
    </button>
  )
}
