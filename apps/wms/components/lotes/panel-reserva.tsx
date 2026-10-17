'use client'

import { useState } from 'react'
import { Lock, LockOpen } from 'lucide-react'
import { aplicarReservaAccion, quitarReservaAccion } from '@/app/acciones-picking'
import { AYUDA_RESERVA, reservaVigente, type ReservaLoteVista } from '@/domain/reserva'
import { formatoFechaHora } from '@/domain/fechas'
import { useAccion } from '../usar-accion'
import { Aviso } from '../entradas/aviso'

/** Reserva del lote: un estado (no un área). El lote sigue Aprobado, pero no se asigna ni se pickea. La ponen y la quitan el Jefe de Transporte y Dirección Técnica. */
export function PanelReserva({ loteId, lote, historia, puedeReservar, tieneStockAprobado }: {
  loteId: string; lote: string; historia: ReservaLoteVista[]; puedeReservar: boolean; tieneStockAprobado: boolean
}) {
  const { pendiente, mensaje, ejecutar } = useAccion()
  const [abierto, setAbierto] = useState(false)
  const [motivo, setMotivo] = useState('')
  const vigente = historia.find(reservaVigente)
  const cerrar = () => { setAbierto(false); setMotivo('') }

  if (!vigente && !puedeReservar && historia.length === 0) return null
  return (
    <section className={`rounded-lg border p-4 ${vigente ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-white'}`} aria-labelledby="titulo-reserva" data-testid="panel-reserva">
      <h2 id="titulo-reserva" className="flex items-center gap-2 font-heading text-lg font-semibold uppercase tracking-wide text-gray-900">
        {vigente ? <Lock className="h-5 w-5 text-amber-800" aria-hidden /> : <LockOpen className="h-5 w-5 text-gray-500" aria-hidden />}
        {vigente ? 'En Reserva' : 'Reserva del lote'}
      </h2>
      {vigente ? (
        <p className="mt-1 text-sm text-amber-900" data-testid="reserva-vigente">
          Desde {formatoFechaHora(vigente.aplicadaEn)}, por {vigente.aplicadaPor}: «{vigente.motivo}». {AYUDA_RESERVA}
        </p>
      ) : (
        <p className="mt-1 text-sm text-gray-700">{AYUDA_RESERVA}</p>
      )}

      {puedeReservar && !abierto && (vigente || tieneStockAprobado) && (
        <div className="mt-3">
          <button type="button" className={vigente ? 'btn-secondary' : 'btn-primary'} onClick={() => setAbierto(true)} data-testid={vigente ? 'quitar-reserva' : 'poner-reserva'}>
            {vigente ? 'Quitar la Reserva' : 'Poner en Reserva'}
          </button>
        </div>
      )}
      {puedeReservar && !vigente && !tieneStockAprobado && <p className="mt-2 text-sm text-gray-600">Este lote no tiene stock Aprobado: solo un lote Aprobado puede ponerse en Reserva.</p>}

      {abierto && (
        <div className="mt-3 space-y-2" data-testid="form-reserva">
          <label htmlFor="motivo-reserva" className="etiqueta">{vigente ? '¿Por qué se quita la Reserva del lote ' : '¿Por qué se pone en Reserva el lote '}{lote}?</label>
          <input id="motivo-reserva" className="campo" value={motivo} onChange={(e) => setMotivo(e.target.value)} data-testid="motivo-reserva" />
          <div className="flex flex-wrap gap-2">
            <button
              type="button" className="btn-primary btn-sm" disabled={pendiente || !motivo.trim()} data-testid="confirmar-reserva"
              onClick={() => ejecutar(
                () => (vigente ? quitarReservaAccion(loteId, motivo) : aplicarReservaAccion(loteId, motivo)),
                { exito: vigente ? `Reserva quitada. El lote ${lote} vuelve a poder asignarse y pickearse.` : `Lote ${lote} en Reserva. Siguiente: si tenía pedidos asignados, el Jefe de Transporte cambia el lote en esas Órdenes de Salida.`, alExito: cerrar },
              )}
            >{vigente ? 'Quitar la Reserva' : 'Poner en Reserva'}</button>
            <button type="button" className="btn-secondary btn-sm" onClick={cerrar}>Cancelar</button>
          </div>
        </div>
      )}
      {mensaje && <div className="mt-3"><Aviso tipo={mensaje.tipo === 'ok' ? 'ok' : 'error'}>{mensaje.texto}</Aviso></div>}

      {historia.length > 0 && (
        <details className="mt-3 text-sm text-gray-700">
          <summary className="cursor-pointer font-medium">Historia de Reservas ({historia.length})</summary>
          <ul className="mt-1 space-y-1" data-testid="historia-reservas">
            {historia.map((r) => (
              <li key={r.id} className="tabular">
                {formatoFechaHora(r.aplicadaEn)} · {r.aplicadaPor}: «{r.motivo}»{r.quitadaEn ? ` — quitada ${formatoFechaHora(r.quitadaEn)} por ${r.quitadaPor}: «${r.motivoQuita}»` : ' — vigente'}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}
