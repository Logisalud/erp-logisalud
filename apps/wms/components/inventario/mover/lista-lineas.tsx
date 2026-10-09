'use client'

import { useState } from 'react'
import { ArrowRight, CheckCircle2, Trash2, TriangleAlert } from 'lucide-react'
import type { LineaContenido, ValidacionLineaMov } from '@/domain/inventario'
import { formatoFecha } from '@/domain/fechas'
import { BuscarDestino, type DestinoElegido } from './destino'
import { ChipEstado, ChipPropietario } from './piezas'

export interface LineaCarrito { celda: LineaContenido; cantidad: string; destino?: DestinoElegido }

export const errorDeCantidad = (l: LineaCarrito): string | undefined => {
  const n = Number(l.cantidad)
  if (!Number.isInteger(n) || n <= 0) return 'Escribe una cantidad mayor que cero.'
  if (n > l.celda.disponible) return `Solo hay ${l.celda.disponible} disponibles.`
  return undefined
}

/** Las líneas del movimiento, una tarjeta por línea: se edita la cantidad, se cambia el destino de esa línea o se quita. */
export function ListaLineas({ lineas, destinoDefecto, validacion, validando, alCambiar, alQuitar }: {
  lineas: LineaCarrito[]; destinoDefecto: DestinoElegido | null; validacion: Map<string, ValidacionLineaMov>; validando: boolean
  alCambiar: (clave: string, cambios: Partial<Pick<LineaCarrito, 'cantidad' | 'destino'>>) => void; alQuitar: (clave: string) => void
}) {
  const [cambiando, setCambiando] = useState<string | null>(null)
  return (
    <ul className="space-y-3" data-testid="mover-lista">
      {lineas.map((l) => {
        const c = l.celda
        const err = errorDeCantidad(l)
        const v = validacion.get(c.clave)
        const efectivo = l.destino ?? destinoDefecto
        return (
          <li key={c.clave} className="rounded-lg border border-gray-300 bg-white p-4" data-testid="mover-linea-carrito">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-gray-900" data-testid="linea-producto">{c.producto}</p>
                <p className="tabular text-sm text-gray-700">Lote {c.lote} · vence {formatoFecha(c.vence)}</p>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1"><ChipEstado e={c.estado} /><ChipPropietario codigo={c.propietario} /></p>
              </div>
              <button type="button" onClick={() => alQuitar(c.clave)} className="-mr-2 -mt-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-gray-700 hover:bg-gray-100" aria-label={`Quitar ${c.producto}, lote ${c.lote}`} data-testid="linea-quitar"><Trash2 className="h-5 w-5" aria-hidden /></button>
            </div>

            <p className="tabular mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 font-heading text-lg font-semibold tracking-wide text-gray-900" data-testid="linea-ruta">
              {c.posicion}<ArrowRight className="h-4 w-4 text-gray-500" aria-hidden />{efectivo ? efectivo.codigo : <span className="font-body text-sm font-normal text-gray-600">sin destino</span>}
              <span className="font-body text-xs font-normal text-gray-600" data-testid="linea-destino-tipo">{l.destino ? '(destino propio)' : efectivo ? '(el del movimiento)' : ''}</span>
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <label htmlFor={`lc-${c.clave}`} className="text-sm text-gray-800">Cantidad</label>
              <input id={`lc-${c.clave}`} className="campo tabular !min-h-12 w-28 text-base" inputMode="numeric" pattern="[0-9]*" value={l.cantidad}
                onChange={(e) => alCambiar(c.clave, { cantidad: e.target.value.replace(/\D/g, '') })} aria-invalid={err ? true : undefined} data-testid="linea-cantidad" />
              <span className="text-sm text-gray-600">de {c.disponible} disponibles</span>
              {Number(l.cantidad) !== c.disponible && <button type="button" className="btn-secondary btn-sm" onClick={() => alCambiar(c.clave, { cantidad: String(c.disponible) })} data-testid="linea-todo">Todo</button>}
            </div>
            {err && <p role="alert" className="mt-1 text-sm text-red-700" data-testid="linea-error-cantidad">{err}</p>}

            {efectivo && v && !err && (v.ok
              ? <p className="mt-2 flex items-center gap-1.5 text-sm text-green-800" data-testid="linea-valida"><CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />{efectivo.codigo} recibe esta línea.</p>
              : <p className="mt-2 flex items-start gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950" data-testid="linea-problema"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{v.mensaje}</p>)}
            {efectivo && !v && validando && !err && <p className="mt-2 text-sm text-gray-600">Validando…</p>}

            <div className="mt-3 flex flex-wrap gap-2">
              {cambiando !== c.clave && <button type="button" className="btn-secondary btn-sm" onClick={() => setCambiando(c.clave)} data-testid="linea-cambiar-destino">{l.destino ? 'Cambiar su destino' : 'Otro destino para esta línea'}</button>}
              {l.destino && <button type="button" className="btn-secondary btn-sm" onClick={() => { alCambiar(c.clave, { destino: undefined }); setCambiando(null) }} data-testid="linea-usar-del-movimiento">Usar el del movimiento</button>}
            </div>
            {cambiando === c.clave && (
              <div className="mt-3 space-y-2 border-t border-gray-200 pt-3" data-testid="linea-buscar-destino">
                <BuscarDestino id={`ld-${c.clave}`} etiqueta="Destino de esta línea" lineas={[{ clave: c.clave, posicionId: c.posicionId, propietarioId: c.propietarioId, propietario: c.propietario, estado: c.estado }]} testid={`linea-q-destino`} autoFoco
                  alElegir={(d) => { alCambiar(c.clave, { destino: d }); setCambiando(null) }} />
                <button type="button" className="btn-secondary btn-sm" onClick={() => setCambiando(null)}>Cancelar</button>
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
