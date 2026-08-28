'use client'

import { useState } from 'react'

type FilaLetra = { numero: string; monto: string; fechaVencimiento: string; bancoNegociacion: string }

export function LetrasInput({ montoObligacion, error }: { montoObligacion: number; error?: string }) {
  const [filas, setFilas] = useState<FilaLetra[]>([{ numero: '', monto: '', fechaVencimiento: '', bancoNegociacion: '' }])

  const actualizar = (i: number, campo: keyof FilaLetra, valor: string) => {
    setFilas((prev) => prev.map((f, idx) => (idx === i ? { ...f, [campo]: valor } : f)))
  }

  const agregar = () => setFilas((prev) => [...prev, { numero: '', monto: '', fechaVencimiento: '', bancoNegociacion: '' }])
  const quitar = (i: number) => setFilas((prev) => prev.filter((_, idx) => idx !== i))

  const suma = filas.reduce((acc, f) => acc + (Number(f.monto) || 0), 0)

  return (
    <div>
      <input type="hidden" name="letrasJson" value={JSON.stringify(filas)} />
      <div className="space-y-2">
        {filas.map((f, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_1fr_1fr_2rem] items-center gap-2">
            <input
              type="text" placeholder="N° letra" value={f.numero} onChange={(e) => actualizar(i, 'numero', e.target.value)}
              className="min-h-12 w-full rounded-md border border-gray-300 px-2 text-sm"
            />
            <input
              type="number" min="0" step="0.01" placeholder="Monto" value={f.monto} onChange={(e) => actualizar(i, 'monto', e.target.value)}
              className="min-h-12 w-full rounded-md border border-gray-300 px-2 text-sm"
            />
            <input
              type="date" value={f.fechaVencimiento} onChange={(e) => actualizar(i, 'fechaVencimiento', e.target.value)}
              className="min-h-12 w-full rounded-md border border-gray-300 px-2 text-sm"
            />
            <input
              type="text" placeholder="Banco (opcional)" value={f.bancoNegociacion} onChange={(e) => actualizar(i, 'bancoNegociacion', e.target.value)}
              className="min-h-12 w-full rounded-md border border-gray-300 px-2 text-sm"
            />
            <button
              type="button" onClick={() => quitar(i)} disabled={filas.length === 1}
              className="text-gray-400 hover:text-red-700 disabled:opacity-30" aria-label={`Quitar letra ${i + 1}`}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <p className="mt-2 text-sm text-gray-700">
        Suma: {suma.toFixed(2)} de {montoObligacion.toFixed(2)}
      </p>
      {error ? <p className="mt-1 text-sm text-red-700">{error}</p> : null}
      <button type="button" onClick={agregar} className="btn-secondary mt-2">
        Agregar letra
      </button>
    </div>
  )
}
