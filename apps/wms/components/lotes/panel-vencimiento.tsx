'use client'

import { useState } from 'react'
import { CalendarCheck, History } from 'lucide-react'
import { corregirVencimientoLoteAccion } from '@/app/acciones-entradas'
import { formatoFecha, formatoFechaHora, textoVencimiento } from '@/domain/fechas'
import type { CambioVencimientoLote } from '@/domain/vencimiento'
import { CampoVencimiento } from '../campo-vencimiento'
import { useAccion } from '../usar-accion'
import { Aviso } from '../entradas/aviso'

/**
 * Fecha de vencimiento del lote. Corregirla es un cambio AUDITADO, no una edición libre: lo hace el Jefe de Almacén o Dirección Técnica,
 * con su motivo, y cada cambio queda en un historial que no se edita ni se borra.
 */
export function PanelVencimiento({ loteId, vence, venceTexto, historia, puedeCorregir }: {
  loteId: string; vence?: string; venceTexto?: string; historia: CambioVencimientoLote[]; puedeCorregir: boolean
}) {
  const { pendiente, mensaje, ejecutar } = useAccion()
  const [abierto, setAbierto] = useState(false)
  const [fecha, setFecha] = useState('')
  const [motivo, setMotivo] = useState('')
  const e = mensaje?.errores ?? {}
  const cerrar = () => { setAbierto(false); setFecha(''); setMotivo('') }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4" aria-labelledby="titulo-vencimiento" data-testid="panel-vencimiento">
      <h2 id="titulo-vencimiento" className="flex items-center gap-2 font-heading text-lg font-semibold uppercase tracking-wide text-gray-900"><CalendarCheck className="h-5 w-5 text-gray-600" aria-hidden />Vencimiento del lote</h2>
      <p className="mt-1 text-gray-900" data-testid="vence-lote">{textoVencimiento(vence, venceTexto)}</p>
      {venceTexto && <p className="mt-1 text-sm text-gray-700">El producto solo trae mes y año. El sistema usó el día por defecto del mes; si el envase dice otro día, corrígelo aquí.</p>}

      {puedeCorregir && !abierto && <div className="mt-3"><button type="button" className="btn-secondary btn-sm" onClick={() => setAbierto(true)} data-testid="abrir-corregir-vence">Corregir la fecha</button></div>}
      {abierto && (
        <div className="mt-3 space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4" data-testid="form-corregir-vence">
          <p className="text-sm text-gray-700">Este cambio queda en el historial con tu nombre, la fecha de antes y tu motivo. Nada se borra.</p>
          <div>
            <label htmlFor="vence-nueva" className="etiqueta">Fecha correcta</label>
            <CampoVencimiento id="vence-nueva" value={fecha} onChange={setFecha} invalido={!!e.fecha} describedBy={e.fecha ? 'vence-nueva-e' : undefined} />
            {e.fecha && <p id="vence-nueva-e" role="alert" className="mt-1 text-sm text-red-700">{e.fecha}</p>}
          </div>
          <div>
            <label htmlFor="vence-motivo" className="etiqueta">Motivo <span className="text-red-700">*</span></label>
            <textarea id="vence-motivo" rows={2} className={`campo !min-h-20 py-2 ${e.motivo ? '!border-red-500' : ''}`} value={motivo} onChange={(ev) => setMotivo(ev.target.value)} placeholder="Por ejemplo: el envase dice 30/06/2028." />
            {e.motivo && <p role="alert" className="mt-1 text-sm text-red-700">{e.motivo}</p>}
          </div>
          {mensaje?.tipo === 'error' && !Object.keys(e).length && <Aviso tipo="error">{mensaje.texto}</Aviso>}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary btn-sm" disabled={pendiente} data-testid="guardar-corregir-vence"
              onClick={() => ejecutar(() => corregirVencimientoLoteAccion(loteId, fecha, motivo), { exito: 'Listo. La fecha quedó corregida y el cambio, en el historial.', alExito: cerrar })}>{pendiente ? 'Guardando…' : 'Guardar la corrección'}</button>
            <button type="button" className="btn-secondary btn-sm" onClick={cerrar}>No corregir</button>
          </div>
        </div>
      )}
      {mensaje?.tipo === 'ok' && <div className="mt-3"><Aviso tipo="ok">{mensaje.texto}</Aviso></div>}

      <h3 className="mt-4 flex items-center gap-2 text-sm font-medium text-gray-800"><History className="h-4 w-4" aria-hidden />Historial de la fecha</h3>
      {historia.length === 0 ? <p className="mt-1 text-sm text-gray-600" data-testid="historial-vence-vacio">La fecha nunca se corrigió.</p> : (
        <ul className="mt-1 divide-y divide-gray-100 text-sm" data-testid="historial-vence">
          {historia.map((c) => (
            <li key={c.id} className="py-2" data-testid="cambio-vence">
              <span className="tabular font-medium text-gray-900">{c.antes ? formatoFecha(c.antes) : 'sin fecha'} → {formatoFecha(c.despues)}</span> · {c.usuario} · {formatoFechaHora(c.ts)}
              <p className="text-gray-700">Motivo: {c.motivo}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
