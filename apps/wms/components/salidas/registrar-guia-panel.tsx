'use client'

import { useState } from 'react'
import { ClipboardCheck, ExternalLink } from 'lucide-react'
import { registrarGuiaPanelAccion } from '@/app/acciones-picking'
import { ESTADOS_GUIA_PANEL, ETIQUETA_ESTADO_PANEL, validarRegistroGuiaPanel, type EstadoGuiaPanel } from '@/domain/guia-electronica'
import { mesAnio } from '@/domain/salidas'
import type { LineaGuia } from '@/domain/documentacion'
import { useAccion } from '../usar-accion'
import { Aviso } from '../entradas/aviso'

/**
 * Piloto «como real» (guia_modo = PANEL): la guía ya se emitió en el panel de Nubefact (o en Odoo). Aquí solo se anota: número, fecha, estado y, si quieres, el enlace.
 * Las líneas salen de lo que confirmó la conformidad; no se vuelven a escribir.
 */
export function RegistrarGuiaPanel({ salidaId, hoy, lineas, alRegistrar }: { salidaId: string; hoy: string; lineas: LineaGuia[]; alRegistrar: (texto: string) => void }) {
  const { pendiente, mensaje, ejecutar } = useAccion()
  const [numero, setNumero] = useState('')
  const [fecha, setFecha] = useState(hoy)
  const [estado, setEstado] = useState<EstadoGuiaPanel>('ACEPTADA')
  const [enlace, setEnlace] = useState('')
  const [nota, setNota] = useState('')
  const [tocado, setTocado] = useState(false)
  const registro = { numero, fechaEmision: fecha, estado, enlace, nota }
  const errores = validarRegistroGuiaPanel(registro, hoy)
  const verErrores = tocado ? errores : { ...errores, numero: numero.trim() ? errores.numero : undefined }
  const incompleto = !numero.trim() || Object.keys(errores).length > 0

  return (
    <div className="mt-2 space-y-4" data-testid="registrar-guia-panel">
      <p className="inline-flex items-center gap-1.5 rounded-full border border-gray-300 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-800" data-testid="modo-guia-panel">
        <ClipboardCheck className="h-4 w-4" aria-hidden />Piloto: la guía se emite en el panel de Nubefact (o en Odoo)
      </p>
      <p className="text-sm text-gray-700">Emite la guía allá y vuelve aquí a anotarla. El WMS no envía nada a Nubefact: solo guarda el número, avisa a Pedidos y deja seguir con el embalaje y la carga.</p>
      <ul className="text-sm text-gray-800" data-testid="guia-panel-lineas">
        {lineas.map((l, k) => <li key={k} className="tabular">{l.productoCodigo} · lote {l.lote} · vence {l.vence ? mesAnio(l.vence) : '—'} · {l.cantidad.toLocaleString('es-PE')} u</li>)}
      </ul>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,16rem)_minmax(0,12rem)_minmax(0,16rem)]">
        <div>
          <label htmlFor="panel-numero" className="etiqueta">N.° de la guía</label>
          <input id="panel-numero" className="campo tabular uppercase" placeholder="TTT1-00000012" value={numero} onChange={(e) => setNumero(e.target.value)} onBlur={() => setTocado(true)} aria-invalid={!!verErrores.numero} aria-describedby={verErrores.numero ? 'panel-numero-error' : undefined} data-testid="panel-numero" />
          {verErrores.numero && <p id="panel-numero-error" className="mt-1 text-sm text-red-800" role="alert" data-testid="panel-error-numero">{verErrores.numero}</p>}
        </div>
        <div>
          <label htmlFor="panel-fecha" className="etiqueta">Fecha de emisión</label>
          <input id="panel-fecha" type="date" className="campo tabular" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} aria-invalid={!!errores.fechaEmision} data-testid="panel-fecha" />
          {errores.fechaEmision && <p className="mt-1 text-sm text-red-800" role="alert" data-testid="panel-error-fecha">{errores.fechaEmision}</p>}
        </div>
        <div>
          <label htmlFor="panel-estado" className="etiqueta">Cómo está en el panel</label>
          <select id="panel-estado" className="campo" value={estado} onChange={(e) => setEstado(e.target.value as EstadoGuiaPanel)} data-testid="panel-estado">
            {ESTADOS_GUIA_PANEL.map((e) => <option key={e} value={e}>{ETIQUETA_ESTADO_PANEL[e]}</option>)}
          </select>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="panel-enlace" className="etiqueta">Enlace al PDF <span className="font-normal text-gray-600">(opcional)</span></label>
          <input id="panel-enlace" inputMode="url" className="campo" placeholder="https://…" value={enlace} onChange={(e) => setEnlace(e.target.value)} aria-invalid={!!errores.enlace} data-testid="panel-enlace" />
          {errores.enlace && <p className="mt-1 text-sm text-red-800" role="alert" data-testid="panel-error-enlace">{errores.enlace}</p>}
        </div>
        <div>
          <label htmlFor="panel-nota" className="etiqueta">Nota <span className="font-normal text-gray-600">(opcional)</span></label>
          <input id="panel-nota" className="campo" value={nota} onChange={(e) => setNota(e.target.value)} data-testid="panel-nota" />
        </div>
      </div>

      {mensaje?.tipo === 'error' && <Aviso tipo="error" testid="error-guia-panel">{mensaje.texto}</Aviso>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn-primary" disabled={pendiente || incompleto} data-testid="registrar-guia-panel-boton"
          onClick={() => { setTocado(true); ejecutar(() => registrarGuiaPanelAccion(salidaId, registro), {
            alExito: (r) => alRegistrar(`Guía ${r.numero} registrada. ${r.pedidos === 'ENVIADO' ? 'Pedidos ya tiene el número y los lotes.' : 'El aviso a Pedidos quedó en la bandeja y se reintenta.'} Siguiente: completa el paquete documental, el embalaje y la carga.`),
          }) }}>
          <ExternalLink className="h-5 w-5" aria-hidden />{pendiente ? 'Registrando…' : 'Registrar guía emitida'}
        </button>
        <span className="text-sm text-gray-700">Una guía no se edita: si hay un error, se anula con el motivo y se registra la correcta.</span>
      </div>
    </div>
  )
}
