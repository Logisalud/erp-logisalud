'use client'

import { useState } from 'react'
import { ArrowRight, CheckCircle2, TriangleAlert, X } from 'lucide-react'
import { buscarDestinoAccion } from '@/app/acciones-inventario'
import type { LineaParaChequear, ResultadoDestino } from '@/domain/inventario'
import { useBusqueda } from '../usar-busqueda'
import { Buscador } from './piezas'

export interface DestinoElegido { posicionId: string; codigo: string; area: string }

/**
 * Elegir un destino buscando por código. Los resultados dicen al instante si «sirve» para las líneas a las que se aplicaría
 * (propietario, área y estado), antes de elegir.
 */
export function BuscarDestino({ id, etiqueta, ayuda, lineas, alElegir, testid, autoFoco }: {
  id: string; etiqueta: string; ayuda?: string; lineas: LineaParaChequear[]; alElegir: (d: DestinoElegido) => void; testid: string; autoFoco?: boolean
}) {
  const [q, setQ] = useState('')
  const r = useBusqueda<ResultadoDestino>(q, (texto) => buscarDestinoAccion(texto, lineas))
  return (
    <div className="space-y-2">
      <Buscador id={id} etiqueta={etiqueta} ayuda={ayuda} valor={q} onCambio={setQ} testid={testid} autoFoco={autoFoco} />
      <div aria-live="polite" className="min-h-5 text-sm text-gray-600">{r.cargando ? 'Buscando…' : r.error ? 'No pudimos buscar. Intenta de nuevo.' : r.resultados && r.resultados.length === 0 ? 'Ninguna ubicación coincide.' : ''}</div>
      <ul className="space-y-2" data-testid={`${testid}-resultados`}>
        {(r.resultados ?? []).map((d) => (
          <li key={d.posicionId}>
            <button type="button" disabled={!!d.motivo} onClick={() => alElegir({ posicionId: d.posicionId, codigo: d.codigo, area: d.area })}
              className={`flex min-h-14 w-full items-center gap-3 rounded-lg border px-4 py-2.5 text-left ${d.motivo ? 'cursor-not-allowed border-gray-200 bg-gray-50' : 'border-gray-300 bg-white hover:border-gray-400 active:bg-gray-50'}`} data-testid="mover-destino" data-sirve={d.motivo ? 'no' : 'si'}>
              <span className="tabular font-heading text-lg font-semibold tracking-wide text-gray-900">{d.codigo}</span>
              <span className="min-w-0 flex-1 text-sm text-gray-600">{d.motivo ? <span className="text-gray-700" data-testid="mover-destino-motivo">{d.motivo}</span> : <>{d.area}{d.ocupadas ? ` · ${d.ocupadas} u` : ' · libre'}</>}</span>
              {lineas.length === 0 ? null : d.invalidas === 0 ? <span className="inline-flex items-center gap-1 text-sm text-green-800"><CheckCircle2 className="h-4 w-4" aria-hidden />Sirve</span>
                : <span className="inline-flex items-center gap-1 text-sm text-amber-900"><TriangleAlert className="h-4 w-4" aria-hidden />{d.general ? 'No disponible' : lineas.length === 1 ? 'No sirve' : `No sirve para ${d.invalidas} de ${lineas.length}`}</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** El destino ya elegido, con su botón para cambiarlo. */
export function DestinoActual({ d, onCambiar, testid, etiquetaCambiar = 'Cambiar' }: { d: DestinoElegido; onCambiar: () => void; testid: string; etiquetaCambiar?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-300 bg-white px-4 py-3" data-testid={testid}>
      <ArrowRight className="h-5 w-5 text-gray-500" aria-hidden />
      <span className="tabular font-heading text-xl font-semibold tracking-wide text-gray-900">{d.codigo}</span>
      <span className="text-sm text-gray-600">{d.area}</span>
      <button type="button" className="btn-secondary btn-sm ml-auto" onClick={onCambiar} data-testid={`${testid}-cambiar`}><X className="h-4 w-4" aria-hidden />{etiquetaCambiar}</button>
    </div>
  )
}
