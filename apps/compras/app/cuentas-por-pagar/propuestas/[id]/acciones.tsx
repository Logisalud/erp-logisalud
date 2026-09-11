'use client'

import { useTransition } from 'react'
import { enviarAAprobacionAction, aprobarPropuestaAction, rechazarPropuestaAction } from './actions'
import type { EstadoPropuesta } from '@/domain/propuesta'

/**
 * Un botón primario por estado, no los tres juntos — cada rol ve solo la
 * acción que le toca decidir ahora (Carta de Simplicidad UX, regla 3).
 */
export function AccionesPropuesta({
  propuestaId,
  estado,
  puedeAprobar,
}: {
  propuestaId: string
  estado: EstadoPropuesta
  /** Aprobar/rechazar es de Contabilidad rol admin o admin (Pieza I).
   * Enviar a aprobación NO: eso lo hace Tesorería, que arma el lote. */
  puedeAprobar: boolean
}) {
  const [pending, startTransition] = useTransition()

  const ejecutar = (accion: (id: string) => Promise<{ error: string } | null>) =>
    startTransition(async () => {
      const resultado = await accion(propuestaId)
      if (resultado?.error) alert(resultado.error)
    })

  if (estado === 'borrador') {
    return (
      <button type="button" disabled={pending} onClick={() => ejecutar(enviarAAprobacionAction)} className="btn-primary mb-4">
        {pending ? 'Enviando…' : 'Enviar a aprobación de Contabilidad'}
      </button>
    )
  }

  if (estado === 'pendiente_aprobacion' && puedeAprobar) {
    return (
      <div className="mb-4 flex gap-2">
        <button type="button" disabled={pending} onClick={() => ejecutar(aprobarPropuestaAction)} className="btn-primary">
          {pending ? 'Guardando…' : 'Aprobar propuesta'}
        </button>
        <button type="button" disabled={pending} onClick={() => ejecutar(rechazarPropuestaAction)} className="btn-secondary">
          Rechazar
        </button>
      </div>
    )
  }

  return null
}
