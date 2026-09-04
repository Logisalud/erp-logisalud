'use client'

import { useTransition } from 'react'
import {
  aprobarPorContabilidadAction, rechazarPorContabilidadAction,
  liquidarAnticipoAction,
} from './actions'
import type { EstadoSolicitud } from '@/domain/gasto'

/**
 * Un par de botones por estado, nunca todos juntos — cada rol ve solo lo que
 * le toca decidir ahora.
 *
 * Pieza A: ya no hay botones de "jefe de área". En Reembolso y Gasto directo
 * el dinero ya salió de la empresa cuando la solicitud se crea, y en
 * Anticipo la decisión real la toma Contabilidad al generar la obligación —
 * las solicitudes nacen en `pendiente_contabilidad`.
 */
export function AccionesSolicitud({ solicitudId, estado }: { solicitudId: string; estado: EstadoSolicitud }) {
  const [pending, startTransition] = useTransition()

  const ejecutar = (accion: (id: string) => Promise<{ error: string } | null>) =>
    startTransition(async () => {
      const resultado = await accion(solicitudId)
      if (resultado?.error) alert(resultado.error)
    })

  if (estado === 'pendiente_contabilidad') {
    return (
      <div className="mt-4 flex gap-2">
        <button type="button" disabled={pending} onClick={() => ejecutar(aprobarPorContabilidadAction)} className="btn-primary">
          {pending ? 'Guardando…' : 'Aprobar (Contabilidad)'}
        </button>
        <button type="button" disabled={pending} onClick={() => ejecutar(rechazarPorContabilidadAction)} className="btn-secondary">
          Rechazar
        </button>
      </div>
    )
  }

  if (estado === 'pendiente_rendicion') {
    return (
      <button
        type="button" disabled={pending}
        onClick={() => ejecutar(liquidarAnticipoAction)}
        className="btn-primary mt-4"
      >
        {pending ? 'Liquidando…' : 'Liquidar con los comprobantes subidos'}
      </button>
    )
  }

  return null
}
