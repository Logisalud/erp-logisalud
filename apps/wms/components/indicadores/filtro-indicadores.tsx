'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { PERIODOS_RAPIDOS } from '@/domain/indicadores'
import { PILDORA_ACTIVA, PILDORA_INACTIVA_HOVER } from '../estilos-opcion'

/** Periodo (últimos 7, 30 y 90 días, o un rango) y propietario. Todo viaja en la dirección, así la vista se puede compartir y volver a abrir. */
export function FiltroIndicadores({ dias, desde, hasta, propietario, propietarios }: { dias: number | null; desde: string; hasta: string; propietario: string; propietarios: string[] }) {
  const router = useRouter()
  const [rango, setRango] = useState(dias === null)
  const [d, setD] = useState(desde)
  const [h, setH] = useState(hasta)
  const ir = (p: { dias?: number; desde?: string; hasta?: string; propietario?: string }) => {
    const q = new URLSearchParams()
    if (p.dias) q.set('dias', String(p.dias)); else if (p.desde && p.hasta) { q.set('desde', p.desde); q.set('hasta', p.hasta) }
    const prop = p.propietario ?? propietario
    if (prop) q.set('propietario', prop)
    router.push(`/reportes/indicadores?${q.toString()}`)
  }
  return (
    <section className="space-y-3 rounded-xl border border-gray-200 bg-white p-4" aria-label="Periodo y propietario" data-testid="filtro-indicadores">
      <div>
        <p className="etiqueta" id="et-periodo">Periodo</p>
        <div className="flex flex-wrap gap-2" role="group" aria-labelledby="et-periodo">
          {PERIODOS_RAPIDOS.map((n) => (
            <button key={n} type="button" aria-pressed={!rango && dias === n} onClick={() => { setRango(false); ir({ dias: n }) }} data-testid={`periodo-${n}`}
              className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium ${!rango && dias === n ? PILDORA_ACTIVA : PILDORA_INACTIVA_HOVER}`}>Últimos {n} días</button>
          ))}
          <button type="button" aria-pressed={rango} onClick={() => setRango(true)} data-testid="periodo-rango"
            className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium ${rango ? PILDORA_ACTIVA : PILDORA_INACTIVA_HOVER}`}>Rango de fechas</button>
        </div>
        {rango && (
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div><label htmlFor="ind-desde" className="etiqueta">Desde</label><input id="ind-desde" type="date" className="campo" value={d} max={h} onChange={(e) => setD(e.target.value)} data-testid="rango-desde" /></div>
            <div><label htmlFor="ind-hasta" className="etiqueta">Hasta</label><input id="ind-hasta" type="date" className="campo" value={h} min={d} onChange={(e) => setH(e.target.value)} data-testid="rango-hasta" /></div>
            <button type="button" className="btn-primary" disabled={!d || !h || d > h} onClick={() => ir({ desde: d, hasta: h })} data-testid="rango-aplicar">Aplicar</button>
          </div>
        )}
      </div>
      <div className="md:max-w-xs">
        <label htmlFor="ind-prop" className="etiqueta">Propietario</label>
        <select id="ind-prop" className="campo" value={propietario} onChange={(e) => ir(rango && d && h ? { desde: d, hasta: h, propietario: e.target.value } : dias ? { dias, propietario: e.target.value } : { desde, hasta, propietario: e.target.value })} data-testid="filtro-propietario-ind">
          <option value="">Todos</option>
          {propietarios.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>
    </section>
  )
}
