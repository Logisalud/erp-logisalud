'use client'

import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { decidirAjusteAccion } from '@/app/acciones-inventario'
import type { AjusteVista } from '@/domain/inventario'
import { formatoFechaHora } from '@/domain/fechas'
import { useAccion } from '../usar-accion'
import { Aviso } from '../entradas/aviso'

function Fila({ a, puedeDecidir }: { a: AjusteVista; puedeDecidir: boolean }) {
  const { pendiente, mensaje, ejecutar } = useAccion()
  const [nota, setNota] = useState('')
  return (
    <li className="space-y-2 px-4 py-3.5" data-testid="ajuste">
      <p className="flex flex-wrap items-baseline gap-x-3"><span className="tabular font-heading text-lg font-semibold tracking-wide">{a.numero}</span><span className="tabular font-medium text-gray-900">{a.delta > 0 ? `+${a.delta}` : `−${Math.abs(a.delta)}`} unidades</span>{a.producto && <span className="text-sm text-gray-700">{a.producto} · lote {a.lote} · {a.posicion}</span>}</p>
      <p className="text-sm text-gray-700">Causa: {a.causa}. Acción: {a.motivo}. Propuso {a.propuestoPor} el {formatoFechaHora(a.propuestoEn)}.</p>
      {a.estado !== 'PROPUESTO' && <p className="text-sm text-gray-800">{a.estado === 'AUTORIZADO' ? 'Autorizado' : 'Rechazado'} por {a.decididoPor}{a.notaDecision ? ` — ${a.notaDecision}` : ''}.</p>}
      {a.estado === 'PROPUESTO' && puedeDecidir && (
        <div className="space-y-2">
          <label htmlFor={`n-${a.id}`} className="etiqueta">Nota (obligatoria si lo rechazas)</label>
          <input id={`n-${a.id}`} className="campo" value={nota} onChange={(e) => setNota(e.target.value)} autoComplete="off" data-testid="ajuste-nota" />
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary btn-sm" disabled={pendiente} onClick={() => ejecutar(() => decidirAjusteAccion(a.id, 'AUTORIZAR', nota || undefined), { exito: 'Ajuste autorizado: el saldo ya cambió y quedó en el Kardex.' })} data-testid="ajuste-autorizar"><Check className="h-4 w-4" aria-hidden />Autorizar</button>
            <button type="button" className="btn-secondary btn-sm" disabled={pendiente} onClick={() => ejecutar(() => decidirAjusteAccion(a.id, 'RECHAZAR', nota || undefined), { exito: 'Ajuste rechazado: la línea queda escalada.' })} data-testid="ajuste-rechazar"><X className="h-4 w-4" aria-hidden />Rechazar</button>
          </div>
        </div>
      )}
      {mensaje && <Aviso tipo={mensaje.tipo === 'ok' ? 'ok' : 'error'}>{mensaje.texto}</Aviso>}
    </li>
  )
}

export function AjustesPorDecidir({ ajustes, puedeDecidir }: { ajustes: AjusteVista[]; puedeDecidir: boolean }) {
  return <ul className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 bg-white" data-testid="lista-ajustes">{ajustes.map((a) => <Fila key={a.id} a={a} puedeDecidir={puedeDecidir} />)}</ul>
}
