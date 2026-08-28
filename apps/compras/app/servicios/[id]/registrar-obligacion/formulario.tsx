'use client'

import { useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { registrarObligacionServicioAction, type EstadoFormulario } from './actions'

const SUGERENCIA_IGV = 0.18

export function FormularioObligacionServicio({ osId, moneda }: { osId: string; moneda: string }) {
  const accionConDatos = registrarObligacionServicioAction.bind(null, osId)
  const [estado, accion] = useFormState<EstadoFormulario, FormData>(accionConDatos, null)
  const errorDe = (campo: string) => estado?.errores.find((e) => e.campo === campo)?.mensaje

  const [base, setBase] = useState('')
  const [igv, setIgv] = useState('')
  const [igvEditadoAMano, setIgvEditadoAMano] = useState(false)

  const cambiarBase = (valor: string) => {
    setBase(valor)
    if (!igvEditadoAMano) {
      const n = Number(valor)
      setIgv(n > 0 ? (Math.round(n * SUGERENCIA_IGV * 100) / 100).toString() : '')
    }
  }

  const total = (Number(base) || 0) + (Number(igv) || 0)

  return (
    <form action={accion} className="space-y-4">
      {errorDe('general') ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900">{errorDe('general')}</p>
      ) : null}

      <section className="card space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="N° de factura" error={errorDe('numeroFactura')}>
            <input type="text" name="numeroFactura" className="min-h-12 w-full rounded-md border border-gray-300 px-3" />
          </Campo>
          <Campo etiqueta="Fecha de factura" error={errorDe('fechaFactura')}>
            <input type="date" name="fechaFactura" className="min-h-12 w-full rounded-md border border-gray-300 px-3" />
          </Campo>
        </div>

        {moneda === 'USD' ? (
          <Campo etiqueta="Tipo de cambio">
            <input type="number" name="tipoCambio" min="0" step="0.0001" className="min-h-12 w-full rounded-md border border-gray-300 px-3" />
          </Campo>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Base imponible" error={errorDe('baseImponible')}>
            <input
              type="number" name="baseImponible" min="0" step="0.01" value={base}
              onChange={(e) => cambiarBase(e.target.value)}
              className="min-h-12 w-full rounded-md border border-gray-300 px-3"
            />
          </Campo>
          <Campo etiqueta="IGV" error={errorDe('igv')}>
            <input
              type="number" name="igv" min="0" step="0.01" value={igv}
              onChange={(e) => { setIgv(e.target.value); setIgvEditadoAMano(true) }}
              className="min-h-12 w-full rounded-md border border-gray-300 px-3"
            />
            <p className="mt-1 text-xs text-gray-500">
              Sugerido en 18% de la base — cambialo si la factura trae otro valor (por ejemplo, 0 en
              un proveedor de un régimen que no discrimina IGV).
            </p>
          </Campo>
        </div>

        <p className="text-sm text-gray-700">Total: {total.toFixed(2)}</p>
      </section>

      <BotonGuardar />
    </form>
  )
}

function BotonGuardar() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="btn-primary w-full sm:w-auto">
      {pending ? 'Guardando…' : 'Registrar obligación'}
    </button>
  )
}

function Campo({ etiqueta, error, children }: { etiqueta: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-gray-800">{etiqueta}</span>
      <div className="mt-1">{children}</div>
      {error ? <p className="mt-1 text-red-700">{error}</p> : null}
    </label>
  )
}
