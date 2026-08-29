'use client'

import { useState } from 'react'
import Link from 'next/link'

export type FilaCuota = { numeroCuota: number; fechaVencimiento: string; montoCapital: string; montoInteres: string }

/**
 * Cronograma de cuotas transcrito a mano tal como lo define el banco o la
 * resolución de SUNAT (ver domain/financiamiento.ts) — el sistema no
 * calcula ninguna amortización. Serializa a un input oculto `cuotasJson`
 * que la Server Action parsea con JSON.parse.
 *
 * `permitirExcel` agrega, además de la tabla manual, un input de archivo
 * `archivoCuotas` y un generador de N cuotas iguales — la Server Action
 * (ver app/financiamiento/fraccionamientos/nueva/actions.ts) prioriza el
 * Excel sobre `cuotasJson` si se subió un archivo.
 */
export function CuotasInput({ error, permitirExcel, plantillaHref }: { error?: string; permitirExcel?: boolean; plantillaHref?: string }) {
  const [filas, setFilas] = useState<FilaCuota[]>([{ numeroCuota: 1, fechaVencimiento: '', montoCapital: '', montoInteres: '' }])
  const [numeroCuotasGen, setNumeroCuotasGen] = useState('')
  const [valorCuotaGen, setValorCuotaGen] = useState('')
  const [primerVencimientoGen, setPrimerVencimientoGen] = useState('')

  const generarIguales = () => {
    const n = Number(numeroCuotasGen)
    const valor = Number(valorCuotaGen)
    if (!(n > 0) || !(valor > 0)) return
    const nuevas: FilaCuota[] = []
    const base = primerVencimientoGen ? new Date(`${primerVencimientoGen}T00:00:00`) : null
    for (let i = 0; i < n; i++) {
      let fechaVencimiento = ''
      if (base) {
        const f = new Date(base)
        f.setMonth(f.getMonth() + i)
        fechaVencimiento = f.toISOString().slice(0, 10)
      }
      nuevas.push({ numeroCuota: i + 1, fechaVencimiento, montoCapital: String(valor), montoInteres: '0' })
    }
    setFilas(nuevas)
  }

  const actualizar = (i: number, campo: keyof FilaCuota, valor: string) => {
    setFilas((prev) => prev.map((f, idx) => (idx === i ? { ...f, [campo]: campo === 'numeroCuota' ? Number(valor) : valor } : f)))
  }

  const agregar = () => setFilas((prev) => [...prev, { numeroCuota: prev.length + 1, fechaVencimiento: '', montoCapital: '', montoInteres: '' }])
  const quitar = (i: number) => setFilas((prev) => prev.filter((_, idx) => idx !== i))

  return (
    <div>
      {permitirExcel ? (
        <div className="mb-3 space-y-3 rounded-md border border-gray-200 p-3">
          <div>
            <p className="text-sm font-medium text-gray-800">Subir el cronograma en Excel</p>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <input
                type="file" name="archivoCuotas" accept=".xlsx,.xls"
                className="block text-sm file:mr-3 file:min-h-12 file:rounded-md file:border-0 file:bg-logisalud-green file:px-3 file:text-white"
              />
              {plantillaHref ? (
                <Link href={plantillaHref} className="text-sm text-logisalud-teal underline">
                  Descargar plantilla
                </Link>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Si subís un archivo, reemplaza lo que hayas escrito abajo — no hace falta llenar la
              tabla manual.
            </p>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-800">O generar N cuotas iguales</p>
            <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <input
                type="number" min="1" placeholder="N° cuotas" value={numeroCuotasGen}
                onChange={(e) => setNumeroCuotasGen(e.target.value)}
                className="min-h-12 w-full rounded-md border border-gray-300 px-2 text-sm"
              />
              <input
                type="number" min="0" step="0.01" placeholder="Valor de cada cuota" value={valorCuotaGen}
                onChange={(e) => setValorCuotaGen(e.target.value)}
                className="min-h-12 w-full rounded-md border border-gray-300 px-2 text-sm"
              />
              <input
                type="date" value={primerVencimientoGen}
                onChange={(e) => setPrimerVencimientoGen(e.target.value)}
                className="min-h-12 w-full rounded-md border border-gray-300 px-2 text-sm"
              />
              <button type="button" onClick={generarIguales} className="btn-secondary">
                Generar
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Rellena la tabla de abajo con N filas del mismo valor (todo en "Capital", interés en
              0) — cada fila queda editable después, no es un cálculo de amortización.
            </p>
          </div>
        </div>
      ) : null}

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
