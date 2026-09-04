'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { completarFacturaAction, type EstadoCompletarFactura } from '@/app/pago-directo/nueva/actions'
import { igvDeBase } from '@/domain/obligacion'
import { useState } from 'react'

/**
 * Pieza E: la obligación se registró con una cotización porque el proveedor
 * todavía no había emitido la factura. Acá se completan los datos reales y
 * la obligación entra al embudo normal (`registrada` → conformidad → pago).
 *
 * La base se puede corregir: la cotización es una estimación, la factura es
 * el documento real y puede venir por otro monto.
 */
export function CompletarFactura({ obligacionId, baseCotizada }: { obligacionId: string; baseCotizada: number }) {
  const accionConId = completarFacturaAction.bind(null, obligacionId)
  const [estado, accion] = useFormState<EstadoCompletarFactura, FormData>(accionConId, null)
  const [base, setBase] = useState(String(baseCotizada))

  const baseNum = Number(base) || 0
  const igv = igvDeBase(baseNum)

  return (
    <form action={accion} className="mt-4 space-y-3 rounded-md border border-amber-200 bg-amber-50 p-3">
      <p className="text-sm text-amber-900">
        Esta obligación está <strong>pendiente de factura</strong>: se registró con la cotización.
        Cuando el proveedor emita el comprobante, completa acá los datos reales — recién entonces
        se puede dar conformidad y pagar.
      </p>

      {estado?.error ? <p className="text-sm text-red-700">{estado.error}</p> : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-sm">
          <span className="font-medium text-gray-800">N° de factura *</span>
          <input type="text" name="numeroFactura" required className="mt-1 min-h-12 w-full rounded-md border border-gray-300 px-3" />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-gray-800">Fecha de factura *</span>
          <input
            type="date" name="fechaFactura" required
            defaultValue={new Date().toISOString().slice(0, 10)}
            className="mt-1 min-h-12 w-full rounded-md border border-gray-300 px-3"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-gray-800">Base imponible *</span>
          <input
            type="number" name="baseImponible" min="0" step="0.01" required
            value={base} onChange={(e) => setBase(e.target.value)}
            className="mt-1 min-h-12 w-full rounded-md border border-gray-300 px-3"
          />
          <span className="mt-1 block text-xs text-gray-600">
            IGV {igv.toFixed(2)} · total {(baseNum + igv).toFixed(2)}
          </span>
        </label>
      </div>

      <BotonCompletar />
    </form>
  )
}

function BotonCompletar() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="btn-primary w-full sm:w-auto">
      {pending ? 'Guardando…' : 'Completar factura'}
    </button>
  )
}
