'use client'

import { useTransition } from 'react'
import { confirmarObligacionTributariaAction } from './actions'

export function ConfirmarBoton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition()

  const confirmar = () =>
    startTransition(async () => {
      const resultado = await confirmarObligacionTributariaAction(id)
      if (resultado?.error) alert(resultado.error)
    })

  return (
    <button type="button" disabled={pending} onClick={confirmar} className="btn-primary">
      {pending ? 'Confirmando…' : 'Confirmar (Contabilidad)'}
    </button>
  )
}
