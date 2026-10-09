'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, SearchX, TriangleAlert } from 'lucide-react'
import { buscarProductoAccion, opcionesDestinoAccion } from '@/app/acciones-inventario'
import type { CeldaDeProducto, LineaParaChequear, ResultadoProducto } from '@/domain/inventario'
import type { MensajeLinea, OpcionDestino } from '@/domain/movimiento-tabla'
import { formatoFecha } from '@/domain/fechas'
import { OPCION_ELEGIDA, OPCION_LIBRE } from '../../estilos-opcion'
import { useBusqueda } from '../usar-busqueda'
import { Buscador, ChipEstado, ChipPropietario } from '../mover/piezas'
import type { DestinoLinea } from './tipos'

/** Resultados de producto: nombre, código y en cuántas ubicaciones está (y el total). Tolera tildes, mayúsculas y coincidencias parciales. */
export function ListaProductos({ consulta, alElegir }: { consulta: string; alElegir: (p: ResultadoProducto) => void }) {
  const r = useBusqueda<ResultadoProducto>(consulta, buscarProductoAccion)
  if (!consulta.trim()) return <p className="px-3 py-2.5 text-sm text-gray-600">Escribe el nombre, el código o el lote.</p>
  return (
    <div className="rounded-lg border border-gray-200 bg-white" data-testid="lista-productos">
      {r.cargando && !r.resultados && <p className="px-3 py-2.5 text-sm text-gray-600">Buscando…</p>}
      {r.error && <p className="px-3 py-2.5 text-sm text-red-800" role="alert">No pudimos buscar. Intenta de nuevo.</p>}
      {r.resultados && r.resultados.length === 0 && !r.cargando && (
        <p className="flex items-start gap-2 px-3 py-2.5 text-sm text-gray-700" data-testid="sin-productos"><SearchX className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden />No encontramos ese producto. Prueba con parte del nombre o el código.</p>
      )}
      <ul className="divide-y divide-gray-100">
        {(r.resultados ?? []).map((p) => (
          <li key={p.productoId}>
            <button type="button" onClick={() => alElegir(p)} className="flex min-h-12 w-full flex-col gap-0.5 px-3 py-2 text-left hover:bg-gray-50 active:bg-gray-100" data-testid="opcion-producto">
              <strong className="text-[13px] font-semibold text-gray-900">{p.descripcion}{p.presentacion ? ` · ${p.presentacion}` : ''}</strong>
              <span className="tabular text-xs text-gray-700">[{p.codigo}] · en {p.ubicaciones} {p.ubicaciones === 1 ? 'ubicación' : 'ubicaciones'} · {p.disponibles.toLocaleString('es-PE')} u{p.coincidencias.length ? ` · ${p.coincidencias.join(' · ')}` : ''}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Dónde está el producto: todas sus ubicaciones con lote, vencimiento, estado, propietario y disponible real; primero lo que vence antes. */
export function ListaOrigenes({ celdas, seleccionada, libreDe, alElegir }: {
  celdas: CeldaDeProducto[]; seleccionada?: string; libreDe: (c: CeldaDeProducto) => number; alElegir: (c: CeldaDeProducto) => void
}) {
  if (celdas.length === 0) return <p className="rounded-lg border border-dashed border-gray-300 px-3 py-3 text-sm text-gray-700" data-testid="sin-origenes">Este producto no tiene unidades disponibles para mover.</p>
  return (
    <div className="rounded-lg border border-gray-200 bg-white" data-testid="lista-origenes">
      <p className="bg-gray-50 px-3 py-1.5 text-xs text-gray-700">Dónde está · primero lo que vence antes</p>
      <ul className="divide-y divide-gray-100">
        {celdas.map((c) => {
          const libre = libreDe(c)
          const sin = libre <= 0
          return (
            <li key={c.clave}>
              <button type="button" disabled={sin} onClick={() => alElegir(c)} aria-current={seleccionada === c.clave ? 'true' : undefined}
                className={`flex w-full flex-col gap-0.5 px-3 py-2 text-left ${sin ? 'cursor-not-allowed bg-gray-50 text-gray-600' : seleccionada === c.clave ? OPCION_ELEGIDA : OPCION_LIBRE}`} data-testid="opcion-origen">
                <span className="flex justify-between gap-2 text-[13px]"><strong className="tabular font-semibold text-gray-900">{c.posicion}</strong><span className="tabular font-medium text-gray-900">{sin ? 'Sin disponible' : `${libre} u`}</span></span>
                <span className="tabular text-xs text-gray-700">Lote {c.lote} · vence {formatoFecha(c.vence)}</span>
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1"><ChipEstado e={c.estado} /><ChipPropietario codigo={c.propietario} />{libre < c.cantidad && !sin && <span className="text-xs text-gray-600">de {c.cantidad} (hay unidades reservadas)</span>}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/**
 * Destinos posibles para UNA línea. Las que no sirven aparecen deshabilitadas con el motivo en palabras
 * (otro propietario, mismo origen, «Ya está aprobado: no vuelve a Cuarentena», «Solo para lotes dados de baja»…).
 */
export function ListaDestinos({ linea, seleccionado, alElegir, autoFoco }: { linea: LineaParaChequear; seleccionado?: string; alElegir: (d: DestinoLinea) => void; autoFoco?: boolean }) {
  const [q, setQ] = useState('')
  const [sugeridas, setSugeridas] = useState<OpcionDestino[] | null>(null)
  const r = useBusqueda<OpcionDestino>(q, (t) => opcionesDestinoAccion(t, linea))
  // Sin texto: las ubicaciones que sirven para esta línea, más unos ejemplos de las que no (con su motivo).
  useEffect(() => {
    let vivo = true
    void opcionesDestinoAccion('', linea).then((o) => { if (vivo) setSugeridas(o) })
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linea.clave, linea.posicionId, linea.estado, linea.propietarioId])
  const lista = q.trim() ? (r.resultados ?? []) : sugeridas ?? []
  return (
    <div className="space-y-2" data-testid="lista-destinos">
      <Buscador id={`q-dest-${linea.clave}`} etiqueta="Buscar ubicación de destino" valor={q} onCambio={setQ} testid="destino-buscar" autoFoco={autoFoco} ayuda="Escribe el código o el área. Las que no sirven salen deshabilitadas con su motivo." />
      {q.trim() && r.resultados && r.resultados.length === 0 && !r.cargando && <p className="text-sm text-gray-700">Ninguna ubicación coincide.</p>}
      <ul className="max-h-72 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-200 bg-white">
        {lista.map((o) => (
          <li key={o.posicionId}>
            <button type="button" disabled={!!o.motivo} onClick={() => alElegir({ posicionId: o.posicionId, codigo: o.codigo, area: o.area })} aria-current={seleccionado === o.posicionId ? 'true' : undefined}
              className={`flex w-full flex-col gap-0.5 px-3 py-2 text-left ${o.motivo ? 'cursor-not-allowed bg-gray-50 text-gray-700' : seleccionado === o.posicionId ? OPCION_ELEGIDA : OPCION_LIBRE}`} data-testid="opcion-destino" data-sirve={o.motivo ? 'no' : 'si'}>
              <span className="flex justify-between gap-2 text-[13px]"><strong className="tabular font-semibold text-gray-900">{o.codigo}</strong><span>{o.area}</span></span>
              <span className={`text-xs ${o.motivo ? 'text-gray-700' : 'text-gray-600'}`} data-testid={o.motivo ? 'destino-motivo' : undefined}>{o.nota}</span>
            </button>
          </li>
        ))}
        {lista.length === 0 && <li className="px-3 py-2.5 text-sm text-gray-600">{r.cargando ? 'Buscando…' : 'Cargando ubicaciones…'}</li>}
      </ul>
    </div>
  )
}

/** El mensaje bajo cada línea: neutral si falta algo, rojo si hay un error; con ícono y texto (nunca solo color). */
export function MensajeDeLinea({ m, lista, className = '' }: { m: MensajeLinea | null; lista: boolean; className?: string }) {
  if (m?.tipo === 'error') return <p role="alert" className={`flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-900 ${className}`} data-testid="mensaje-linea" data-tipo="error"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{m.texto}</p>
  if (m) return <p className={`rounded-md bg-gray-50 px-3 py-2 text-[13px] text-gray-700 ${className}`} data-testid="mensaje-linea" data-tipo="falta">{m.texto}</p>
  return lista ? <p className={`flex items-center gap-2 px-3 py-1 text-[13px] text-green-800 ${className}`} data-testid="mensaje-linea" data-tipo="lista"><CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />Lista.</p> : null
}
