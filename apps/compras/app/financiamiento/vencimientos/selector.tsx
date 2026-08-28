'use client'

import { useState, useTransition } from 'react'
import { Money } from '@/components/money'
import { generarObligacionesAction } from './actions'
import { ETIQUETA_TIPO_VENCIMIENTO, estaVencida, type TipoVencimiento, type VencimientoProximo } from '@/domain/financiamiento'

export function SelectorVencimientos({ vencimientos }: { vencimientos: VencimientoProximo[] }) {
  const [elegidos, setElegidos] = useState<Set<string>>(new Set())
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const hoy = new Date().toISOString().slice(0, 10)

  const clave = (v: VencimientoProximo) => `${v.tipo}:${v.id}`
  const toggle = (v: VencimientoProximo) =>
    setElegidos((prev) => {
      const next = new Set(prev)
      const k = clave(v)
      next.has(k) ? next.delete(k) : next.add(k)
      return next
    })

  const generar = () => {
    setError(null)
    const seleccion = vencimientos
      .filter((v) => elegidos.has(clave(v)))
      .map((v) => ({ tipo: v.tipo as TipoVencimiento, id: v.id }))
    startTransition(async () => {
      const resultado = await generarObligacionesAction(seleccion)
      if (resultado?.error) setError(resultado.error)
      else setElegidos(new Set())
    })
  }

  return (
    <div>
      {error ? <p className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900">{error}</p> : null}

      <ul className="space-y-2">
        {vencimientos.map((v) => {
          const k = clave(v)
          const vencida = estaVencida(v.fechaVencimiento, hoy)
          return (
            <li key={k} className={`card flex items-center gap-3 ${vencida ? 'border-red-200' : ''}`}>
              <input type="checkbox" checked={elegidos.has(k)} onChange={() => toggle(v)} className="h-5 w-5" aria-label={v.etiqueta} />
              <div className="flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium">{v.etiqueta}</span>
                  <Money valor={v.monto} moneda={v.moneda} />
                </div>
                <p className="mt-0.5 text-sm text-gray-600">
                  {ETIQUETA_TIPO_VENCIMIENTO[v.tipo]} · vence {v.fechaVencimiento}
                  {vencida ? <span className="ml-2 text-xs font-medium text-red-700">vencida</span> : null}
                </p>
              </div>
            </li>
          )
        })}
      </ul>

      <button
        type="button" onClick={generar} disabled={pending || elegidos.size === 0}
        className="btn-primary mt-4 w-full sm:w-auto"
      >
        {pending ? 'Generando…' : `Generar obligaciones (${elegidos.size})`}
      </button>
    </div>
  )
}
