'use client'

import { useTransition } from 'react'
import { crearReposicionAction } from './actions'

export function PedirReposicion({ fondoId }: { fondoId: string }) {
  const [pending, startTransition] = useTransition()

  const pedir = () =>
    startTransition(async () => {
      const resultado = await crearReposicionAction(fondoId)
      if (resultado?.error) alert(resultado.error)
    })

  return (
    <button type="button" disabled={pending} onClick={pedir} className="btn-primary w-full sm:w-auto">
      {pending ? 'Armando…' : 'Pedir reposición con estos movimientos'}
    </button>
  )
}
