'use client'

import { useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { crearPropuestaAction, type EstadoFormulario } from './actions'
import { Money } from '@/components/money'

type ObligacionConforme = {
  id: string
  codigo: string
  numero_factura: string | null
  moneda: string
  neto_a_pagar: number
  fecha_vencimiento_real: string | null
  proveedor: { razon_social: string } | null
  beneficiario: { nombre: string | null } | null
  notasCreditoSinAplicar: number
}

export function FormularioPropuesta({ obligaciones }: { obligaciones: ObligacionConforme[] }) {
  const [estado, accion] = useFormState<EstadoFormulario, FormData>(crearPropuestaAction, null)
  const [elegidas, setElegidas] = useState<Set<string>>(new Set())

  const toggle = (id: string) =>
    setElegidas((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const total = obligaciones.filter((o) => elegidas.has(o.id)).reduce((acc, o) => acc + o.neto_a_pagar, 0)

  return (
    <form action={accion} className="space-y-4">
      {estado?.error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900">{estado.error}</p>
      ) : null}

      <ul className="space-y-2">
        {obligaciones.map((o) => (
          <li key={o.id}>
            <label className="card flex cursor-pointer items-start gap-3">
              <input
                type="checkbox" name="obligacionId" value={o.id}
                checked={elegidas.has(o.id)}
                onChange={() => toggle(o.id)}
                className="mt-1 h-5 w-5"
              />
              <div className="flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium">{o.codigo}{o.numero_factura ? ` · ${o.numero_factura}` : ''}</span>
                  <Money valor={o.neto_a_pagar} moneda={o.moneda} />
                </div>
                <p className="mt-0.5 text-sm text-gray-600">
                  {o.proveedor?.razon_social ?? o.beneficiario?.nombre ?? 'sin proveedor ni beneficiario'}
                  {o.fecha_vencimiento_real ? ` · vence ${o.fecha_vencimiento_real}` : ''}
                </p>
                {o.notasCreditoSinAplicar > 0 ? (
                  <p className="mt-1 text-xs text-amber-700">
                    Tiene una nota de crédito sin aplicar todavía — el monto de esta propuesta no la descuenta.
                  </p>
                ) : null}
              </div>
            </label>
          </li>
        ))}
      </ul>

      <div className="card flex items-center justify-between">
        <span className="text-sm text-gray-600">{elegidas.size} elegidas</span>
        <span className="font-semibold tabular-nums">S/ {total.toLocaleString('es-PE', { minimumFractionDigits: 2 })}</span>
      </div>

      <BotonCrear />
    </form>
  )
}

function BotonCrear() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="btn-primary w-full sm:w-auto">
      {pending ? 'Creando…' : 'Crear propuesta'}
    </button>
  )
}
