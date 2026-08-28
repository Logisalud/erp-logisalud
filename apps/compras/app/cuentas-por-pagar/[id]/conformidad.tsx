'use client'

import { useTransition } from 'react'
import { darConformidadAction } from './actions'

/** Un solo botón primario: dar conformidad. No hay una segunda acción compitiendo acá. */
export function BotonConformidad({ obligacionId }: { obligacionId: string }) {
  const [pending, startTransition] = useTransition()

  return (
    <div className="mt-4">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const resultado = await darConformidadAction(obligacionId)
            if (resultado?.error) alert(resultado.error)
          })
        }
        className="btn-primary"
      >
        {pending ? 'Guardando…' : 'Dar conformidad'}
      </button>
    </div>
  )
}
