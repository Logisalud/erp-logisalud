'use client'

import { useState, useTransition } from 'react'
import { verVoucherAction } from './actions'

type AccionVerArchivo = (storagePath: string) => Promise<{ url: string } | { error: string }>

/** `accion` por defecto abre desde `legajos-pagos` (voucher/detracción) — para
 * otro bucket (ej. la cotización/factura de Pago Directo, en `legajos-compras`)
 * se pasa `verLegajoPagoDirectoAction`. */
export function VerVoucher({
  storagePath, etiqueta, accion = verVoucherAction,
}: { storagePath: string; etiqueta: string; accion?: AccionVerArchivo }) {
  const [pending, iniciar] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const abrir = () => {
    setError(null)
    iniciar(async () => {
      const resultado = await accion(storagePath)
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
