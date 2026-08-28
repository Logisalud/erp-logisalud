'use client'

import { useTransition } from 'react'
import { aprobarOSAction, rechazarOSAction } from './actions'
import type { EstadoOS } from '@/domain/servicio'

/** Un par de botones por estado, nunca los cuatro juntos — cada rol ve solo lo que le toca decidir ahora. */
export function AccionesOS({ osId, estado }: { osId: string; estado: EstadoOS }) {
  const [pending, startTransition] = useTransition()

  const ejecutar = (accion: (id: string) => Promise<{ error: string } | null>) =>
    startTransition(async () => {
      const resultado = await accion(osId)
      if (resultado?.error) alert(resultado.error)
    })

  if (estado !== 'pendiente_jefe') return null

  return (
    <div className="mt-4 flex gap-2">
      <button type="button" disabled={pending} onClick={() => ejecutar(aprobarOSAction)} className="btn-primary">
        {pending ? 'Guardando…' : 'Aprobar (jefe de área)'}
      </button>
      <button type="button" disabled={pending} onClick={() => ejecutar(rechazarOSAction)} className="btn-secondary">
        Rechazar
      </button>
    </div>
  )
}
