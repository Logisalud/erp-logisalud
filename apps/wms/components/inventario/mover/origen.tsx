'use client'

import { useState } from 'react'
import { MapPin, SearchX, X } from 'lucide-react'
import { buscarOrigenAccion, ubicacionesProductoAccion } from '@/app/acciones-inventario'
import type { CeldaDeProducto, ResultadoOrigen } from '@/domain/inventario'
import { formatoFecha } from '@/domain/fechas'
import { useBusqueda } from '../usar-busqueda'
import { Buscador, ChipEstado, ChipPropietario, nLineas, nUnidades } from './piezas'

export interface OrigenElegido { posicionId: string; codigo: string; area: string }

/** Elegir una ubicación de ORIGEN buscando por código, producto o lote. */
export function BuscarOrigen({ id, etiqueta, ayuda, alElegir, testid }: { id: string; etiqueta: string; ayuda?: string; alElegir: (o: OrigenElegido) => void; testid: string }) {
  const [q, setQ] = useState('')
  const r = useBusqueda<ResultadoOrigen>(q, buscarOrigenAccion)
  return (
    <div className="space-y-2">
      <Buscador id={id} etiqueta={etiqueta} ayuda={ayuda} valor={q} onCambio={setQ} testid={testid} />
      <div aria-live="polite" className="min-h-5 text-sm text-gray-600">{r.cargando ? 'Buscando…' : r.error ? 'No pudimos buscar. Intenta de nuevo.' : ''}</div>
      {r.resultados && r.resultados.length === 0 && !r.cargando && (
        <p className="flex items-center gap-2 rounded-lg border border-dashed border-gray-300 bg-white px-4 py-5 text-sm text-gray-700"><SearchX className="h-5 w-5 shrink-0 text-gray-400" aria-hidden />Ninguna ubicación con stock coincide con «{q}».</p>
      )}
      <ul className="space-y-2" data-testid={`${testid}-resultados`}>
        {(r.resultados ?? []).map((o) => (
          <li key={o.posicionId}>
            <button type="button" disabled={!!o.bloqueada} onClick={() => alElegir({ posicionId: o.posicionId, codigo: o.codigo, area: o.area })}
              className={`flex min-h-14 w-full items-center gap-3 rounded-lg border px-4 py-2.5 text-left ${o.bloqueada ? 'cursor-not-allowed border-gray-200 bg-gray-50 text-gray-500' : 'border-gray-300 bg-white hover:border-gray-400 active:bg-gray-50'}`} data-testid="mover-origen-resultado">
              <MapPin className="h-5 w-5 shrink-0 text-gray-500" aria-hidden />
              <span className="tabular font-heading text-lg font-semibold tracking-wide text-gray-900">{o.codigo}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-gray-600">{o.bloqueada ? `No se puede: ${o.bloqueada}` : `${o.area} · ${nLineas(o.lineas)}`}</span>
              <span className="tabular text-sm text-gray-700">{nUnidades(o.unidades)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function OrigenActual({ o, onCambiar, onQuitar, testid }: { o: OrigenElegido; onCambiar: () => void; onQuitar: () => void; testid: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-300 bg-white px-4 py-3" data-testid={testid}>
      <MapPin className="h-5 w-5 text-gray-500" aria-hidden />
      <span className="tabular font-heading text-xl font-semibold tracking-wide text-gray-900">{o.codigo}</span>
      <span className="text-sm text-gray-600">{o.area}</span>
      <span className="ml-auto flex gap-2">
        <button type="button" className="btn-secondary btn-sm" onClick={onCambiar} data-testid={`${testid}-cambiar`}>Cambiar</button>
        <button type="button" className="btn-secondary btn-sm" onClick={onQuitar} aria-label="Quitar el origen por defecto" data-testid={`${testid}-quitar`}><X className="h-4 w-4" aria-hidden /></button>
      </span>
    </div>
  )
}

/** Cambiar de dónde sale UNA línea: las demás ubicaciones donde está ese mismo producto (otro lote u otra ubicación). */
export function CambiarOrigenLinea({ productoId, claveActual, enMovimiento, alElegir, alCancelar }: {
  productoId: string; claveActual: string; enMovimiento: Set<string>; alElegir: (c: CeldaDeProducto) => void; alCancelar: () => void
}) {
  const [celdas, setCeldas] = useState<CeldaDeProducto[] | null>(null)
  const [cargando, setCargando] = useState(false)
  if (celdas === null && !cargando) { setCargando(true); void ubicacionesProductoAccion(productoId).then((c) => { setCeldas(c); setCargando(false) }) }
  const opciones = (celdas ?? []).filter((c) => c.clave !== claveActual)
  return (
    <div className="mt-3 space-y-2 border-t border-gray-200 pt-3" data-testid="linea-cambiar-origen-panel">
      <p className="text-sm font-medium text-gray-900">¿De dónde sale esta línea?</p>
      {cargando && <p className="text-sm text-gray-600">Buscando dónde está…</p>}
      {celdas && opciones.length === 0 && <p className="text-sm text-gray-700">Este producto no está en otra ubicación.</p>}
      <ul className="space-y-2">
        {opciones.map((c) => {
          const no = c.bloqueada ? `${c.posicion} ${c.bloqueada}` : enMovimiento.has(c.clave) ? 'Ya está en el movimiento' : c.disponible === 0 ? 'Reservadas por otro movimiento' : ''
          return (
            <li key={c.clave}>
              <button type="button" disabled={!!no} onClick={() => alElegir(c)} className={`flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-left ${no ? 'cursor-not-allowed border-gray-200 bg-gray-50 text-gray-600' : 'border-gray-300 bg-white hover:border-gray-400 active:bg-gray-50'}`} data-testid="linea-origen-opcion">
                <span className="min-w-0 flex-1">
                  <span className="tabular block font-heading text-base font-semibold tracking-wide text-gray-900">{c.posicion} <span className="font-body text-sm font-normal text-gray-600">· {c.area}</span></span>
                  <span className="tabular block text-sm text-gray-700">Lote {c.lote} · vence {formatoFecha(c.vence)}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1"><ChipEstado e={c.estado} /><ChipPropietario codigo={c.propietario} /></span>
                  {no && <span className="mt-1 block text-xs text-gray-700">{no}</span>}
                </span>
                <span className="tabular shrink-0 text-right text-sm text-gray-700"><strong className="block text-base text-gray-900">{c.disponible} u</strong>disponibles</span>
              </button>
            </li>
          )
        })}
      </ul>
      <button type="button" className="btn-secondary btn-sm" onClick={alCancelar}>Cancelar</button>
    </div>
  )
}
