'use client'

import { useTransition } from 'react'
import {
  aprobarPorJefeAction, rechazarPorJefeAction,
  aprobarPorContabilidadAction, rechazarPorContabilidadAction,
  liquidarAnticipoAction,
} from './actions'
import type { EstadoSolicitud } from '@/domain/gasto'

/** Un par de botones por estado, nunca los cuatro juntos — cada rol ve solo lo que le toca decidir ahora. */
export function AccionesSolicitud({ solicitudId, estado }: { solicitudId: string; estado: EstadoSolicitud }) {
  const [pending, startTransition] = useTransition()

  const ejecutar = (accion: (id: string) => Promise<{ error: string } | null>) =>
    startTransition(async () => {
      const resultado = await accion(solicitudId)
      if (resultado?.error) alert(resultado.error)
    })

  if (estado === 'pendiente_jefe') {
    return (
      <div className="mt-4 flex gap-2">
        <button type="button" disabled={pending} onClick={() => ejecutar(aprobarPorJefeAction)} className="btn-primary">
          {pending ? 'Guardando…' : 'Aprobar (jefe de área)'}
        </button>
        <button type="button" disabled={pending} onClick={() => ejecutar(rechazarPorJefeAction)} className="btn-secondary">
          Rechazar
        </button>
      </div>
    )
  }

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
