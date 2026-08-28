'use client'

import { useState } from 'react'

export type FilaCuota = { numeroCuota: number; fechaVencimiento: string; montoCapital: string; montoInteres: string }

/**
 * Cronograma de cuotas transcrito a mano tal como lo define el banco o la
 * resolución de SUNAT (ver domain/financiamiento.ts) — el sistema no
 * calcula ninguna amortización. Serializa a un input oculto `cuotasJson`
 * que la Server Action parsea con JSON.parse.
 */
export function CuotasInput({ error }: { error?: string }) {
  const [filas, setFilas] = useState<FilaCuota[]>([{ numeroCuota: 1, fechaVencimiento: '', montoCapital: '', montoInteres: '' }])

  const actualizar = (i: number, campo: keyof FilaCuota, valor: string) => {
    setFilas((prev) => prev.map((f, idx) => (idx === i ? { ...f, [campo]: campo === 'numeroCuota' ? Number(valor) : valor } : f)))
  }

  const agregar = () => setFilas((prev) => [...prev, { numeroCuota: prev.length + 1, fechaVencimiento: '', montoCapital: '', montoInteres: '' }])
  const quitar = (i: number) => setFilas((prev) => prev.filter((_, idx) => idx !== i))

  return (
    <div>
      <input type="hidden" name="cuotasJson" value={JSON.stringify(filas)} />
      <div className="space-y-2">
        {filas.map((f, i) => (
          <div key={i} className="grid grid-cols-[3rem_1fr_1fr_1fr_2rem] items-center gap-2">
            <input
              type="number" min="1" value={f.numeroCuota} onChange={(e) => actualizar(i, 'numeroCuota', e.target.value)}
              className="min-h-12 w-full rounded-md border border-gray-300 px-2 text-sm" aria-label={`Cuota ${i + 1}: número`}
            />
            <input
              type="date" value={f.fechaVencimiento} onChange={(e) => actualizar(i, 'fechaVencimiento', e.target.value)}
              className="min-h-12 w-full rounded-md border border-gray-300 px-2 text-sm" aria-label={`Cuota ${i + 1}: vencimiento`}
            />
            <input
              type="number" min="0" step="0.01" placeholder="Capital" value={f.montoCapital} onChange={(e) => actualizar(i, 'montoCapital', e.target.value)}
              className="min-h-12 w-full rounded-md border border-gray-300 px-2 text-sm" aria-label={`Cuota ${i + 1}: capital`}
            />
            <input
              type="number" min="0" step="0.01" placeholder="Interés" value={f.montoInteres} onChange={(e) => actualizar(i, 'montoInteres', e.target.value)}
              className="min-h-12 w-full rounded-md border border-gray-300 px-2 text-sm" aria-label={`Cuota ${i + 1}: interés`}
            />
            <button
              type="button" onClick={() => quitar(i)} disabled={filas.length === 1}
              className="text-gray-400 hover:text-red-700 disabled:opacity-30" aria-label={`Quitar cuota ${i + 1}`}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      {error ? <p className="mt-1 text-sm text-red-700">{error}</p> : null}
      <button type="button" onClick={agregar} className="btn-secondary mt-2">
        Agregar cuota
      </button>
    </div>
  )
}
