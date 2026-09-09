'use client'

import { useState, useTransition } from 'react'
import { verCotizacionAction } from './actions'

export function VerCotizacion({ storagePath }: { storagePath: string }) {
  const [pending, iniciar] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const abrir = () => {
    setError(null)
    iniciar(async () => {
      const resultado = await verCotizacionAction(storagePath)
      if ('error' in resultado) setError(resultado.error)
      else window.open(resultado.url, '_blank', 'noopener,noreferrer')
    })
  }

  return (
    <>
      <button type="button" onClick={abrir} disabled={pending} className="ml-2 text-xs text-logisalud-teal underline disabled:opacity-60">
        {pending ? 'Abriendo…' : 'Ver cotización'}
      </button>
      {error ? <span className="ml-2 text-xs text-red-700">{error}</span> : null}
    </>
  )
}
