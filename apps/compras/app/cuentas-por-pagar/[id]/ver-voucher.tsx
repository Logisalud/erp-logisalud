'use client'

import { useState, useTransition } from 'react'
import { verVoucherAction } from './actions'

export function VerVoucher({ storagePath, etiqueta }: { storagePath: string; etiqueta: string }) {
  const [pending, iniciar] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const abrir = () => {
    setError(null)
    iniciar(async () => {
      const resultado = await verVoucherAction(storagePath)
      if ('error' in resultado) setError(resultado.error)
      else window.open(resultado.url, '_blank', 'noopener,noreferrer')
    })
  }

  return (
    <span>
      <button type="button" onClick={abrir} disabled={pending} className="text-sm text-logisalud-teal underline disabled:opacity-60">
        {pending ? 'Abriendo…' : etiqueta}
      </button>
      {error ? <span className="ml-2 text-xs text-red-700">{error}</span> : null}
    </span>
  )
}
