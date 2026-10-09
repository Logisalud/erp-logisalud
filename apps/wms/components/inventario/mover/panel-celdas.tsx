'use client'

import { useState } from 'react'
import { PILDORA_ACTIVA, PILDORA_INACTIVA_HOVER } from '../../estilos-opcion'
import type { CeldaDeProducto } from '@/domain/inventario'
import { formatoFecha } from '@/domain/fechas'
import { ChipEstado, ChipPropietario, nLineas } from './piezas'

export interface CeldaElegida { celda: CeldaDeProducto; cantidad: number }

/**
 * Las celdas (ubicación + lote + estado) entre las que se elige qué mover: casilla, cantidad editable (por defecto todo lo disponible)
 * y un solo botón para agregarlas al movimiento. Sirve igual para «por producto» (muestra dónde está) y «por ubicación» (muestra qué hay).
 */
export function PanelCeldas({ celdas, enMovimiento, mostrarUbicacion, conMoverTodo, alAgregar, testid }: {
  celdas: CeldaDeProducto[]; enMovimiento: Set<string>; mostrarUbicacion: boolean; conMoverTodo?: boolean; alAgregar: (e: CeldaElegida[]) => void; testid: string
}) {
  const [marcas, setMarcas] = useState<Record<string, string>>({})
  const libre = (c: CeldaDeProducto) => c.disponible > 0 && !c.bloqueada && !enMovimiento.has(c.clave)
  const marcadas = celdas.filter((c) => c.clave in marcas)
  const error = (c: CeldaDeProducto) => {
    const n = Number(marcas[c.clave])
    if (!Number.isInteger(n) || n <= 0) return 'Escribe una cantidad mayor que cero.'
    if (n > c.disponible) return `Solo hay ${c.disponible} disponibles.`
    return undefined
  }
  const hayError = marcadas.some((c) => error(c))
  const alternar = (c: CeldaDeProducto) => setMarcas((m) => { const n = { ...m }; if (c.clave in n) delete n[c.clave]; else n[c.clave] = String(c.disponible); return n })
  const todo = () => setMarcas(Object.fromEntries(celdas.filter(libre).map((c) => [c.clave, String(c.disponible)])))

  function agregar() {
    alAgregar(marcadas.map((c) => ({ celda: c, cantidad: Number(marcas[c.clave]) })))
    setMarcas({})
  }

  return (
    <div className="space-y-3" data-testid={testid}>
      {conMoverTodo && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary btn-sm" onClick={todo} data-testid="mover-todo">Mover todo</button>
          {marcadas.length > 0 && <button type="button" className="btn-secondary btn-sm" onClick={() => setMarcas({})} data-testid="mover-quitar-todo">Quitar todo</button>}
        </div>
      )}
      <ul className="space-y-2" data-testid="mover-celdas">
        {celdas.map((c) => {
          const on = c.clave in marcas
          const ya = enMovimiento.has(c.clave)
          const e = on ? error(c) : undefined
          const motivoNo = c.bloqueada ? `${c.posicion} ${c.bloqueada}` : ya ? 'Ya está en el movimiento' : c.disponible === 0 ? 'Reservadas por otro movimiento' : undefined
          return (
            <li key={c.clave} className={`rounded-lg border ${on ? PILDORA_ACTIVA : PILDORA_INACTIVA_HOVER} ${motivoNo ? 'opacity-70' : ''}`} data-testid="mover-celda">
              <label className={`flex min-h-16 items-start gap-3 px-4 py-3 ${motivoNo ? '' : 'cursor-pointer'}`}>
                <input type="checkbox" className="mt-1 h-6 w-6 shrink-0 accent-green-600" checked={on} disabled={!libre(c)} onChange={() => alternar(c)}
                  aria-label={`Mover ${c.producto}, lote ${c.lote}, desde ${c.posicion}`} data-testid="mover-marcar" />
                <span className="min-w-0 flex-1">
                  {mostrarUbicacion
                    ? <span className="tabular block font-heading text-lg font-semibold tracking-wide text-gray-900">{c.posicion} <span className="font-body text-sm font-normal text-gray-600">· {c.area}</span></span>
                    : <span className="block font-medium text-gray-900">{c.producto}</span>}
                  <span className="tabular block text-sm text-gray-700">Lote {c.lote} · vence {formatoFecha(c.vence)}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1"><ChipEstado e={c.estado} /><ChipPropietario codigo={c.propietario} /></span>
                  {motivoNo && <span className="mt-1 block text-xs text-gray-700" data-testid="mover-celda-no">{motivoNo}</span>}
                </span>
                <span className="tabular shrink-0 text-right text-sm text-gray-700"><strong className="block text-base text-gray-900">{c.disponible} u</strong>{c.disponible < c.cantidad ? `de ${c.cantidad}` : 'disponibles'}</span>
              </label>
              {on && (
                <div className="flex flex-wrap items-center gap-2 border-t border-green-200 px-4 pb-3 pt-2.5">
                  <label htmlFor={`cant-${c.clave}`} className="text-sm text-gray-800">Cantidad a mover</label>
                  <input id={`cant-${c.clave}`} className="campo tabular !min-h-12 w-28 text-base" inputMode="numeric" pattern="[0-9]*" value={marcas[c.clave]}
                    onChange={(ev) => setMarcas({ ...marcas, [c.clave]: ev.target.value.replace(/\D/g, '') })} aria-invalid={e ? true : undefined} data-testid="mover-cantidad" />
                  {Number(marcas[c.clave]) !== c.disponible && <button type="button" className="btn-secondary btn-sm" onClick={() => setMarcas({ ...marcas, [c.clave]: String(c.disponible) })} data-testid="mover-linea-todo">Todo ({c.disponible})</button>}
                  {e && <p role="alert" className="w-full text-sm text-red-700" data-testid="mover-error-cantidad">{e}</p>}
                </div>
              )}
            </li>
          )
        })}
      </ul>
      <button type="button" className="btn-primary w-full sm:w-auto" disabled={marcadas.length === 0 || hayError} onClick={agregar} data-testid="mover-agregar">
        {marcadas.length === 0 ? 'Marca lo que quieres mover' : `Agregar al movimiento (${nLineas(marcadas.length)})`}
      </button>
    </div>
  )
}
