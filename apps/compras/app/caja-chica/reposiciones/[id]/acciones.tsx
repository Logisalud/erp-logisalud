'use client'

import { useTransition } from 'react'
import {
  aprobarPorJefeAction, rechazarPorJefeAction,
  aprobarPorContabilidadAction, rechazarPorContabilidadAction,
} from './actions'
import type { EstadoReposicion } from '@/domain/caja-chica'

/** Un par de botones por estado, nunca los cuatro juntos — cada rol ve solo lo que le toca decidir ahora. */
export function AccionesReposicion({ reposicionId, estado }: { reposicionId: string; estado: EstadoReposicion }) {
  const [pending, startTransition] = useTransition()

  const ejecutar = (accion: (id: string) => Promise<{ error: string } | null>) =>
    startTransition(async () => {
      const resultado = await accion(reposicionId)
      if (resultado?.error) alert(resultado.error)
    })

  if (estado === 'pendiente_jefe') {
    return (
      <div className="mt-4 flex gap-2">
        <button type="button" disabled={pending} onClick={() => ejecutar(aprobarPorJefeAction)} className="btn-primary">
          {pending ? 'Guardando…' : 'Aprobar (jefe de Almacén)'}
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

  return null
}
