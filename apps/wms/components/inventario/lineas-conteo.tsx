'use client'

import { useState } from 'react'
import { CheckCircle2, Hand, Siren } from 'lucide-react'
import { escalarLineaConteoAccion, proponerAjusteAccion, registrarCausaConteoAccion, registrarConteoAccion } from '@/app/acciones-inventario'
import type { LineaConteoVista } from '@/domain/inventario'
import { ETIQUETA_ESTADO } from '@/domain/estados'
import { formatoFecha } from '@/domain/fechas'
import { useAccion } from '../usar-accion'
import { Aviso } from '../entradas/aviso'
import { ChipResultado } from './chips-inventario'

function Linea({ l, gestiona, cerrado }: { l: LineaConteoVista; gestiona: boolean; cerrado: boolean }) {
  const { pendiente, mensaje, ejecutar } = useAccion()
  const [cantidad, setCantidad] = useState('')
  const [causa, setCausa] = useState(l.causa ?? '')
  const [motivo, setMotivo] = useState('')
  const [nota, setNota] = useState('')
  const [panel, setPanel] = useState<'ajuste' | 'escalar' | null>(null)
  const conDiferencia = l.resultado === 'DIFERENCIA_CONFIRMADA' || l.resultado === 'NO_CONCLUYENTE'
  return (
    <li className="space-y-2.5 px-4 py-3.5" data-testid="linea-conteo">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <span className="tabular w-16 font-heading text-lg font-semibold tracking-wide">{l.posicion}</span>
        <span className="min-w-0 flex-1"><span className="block font-medium text-gray-900">{l.producto}</span><span className="tabular text-sm text-gray-600">Lote {l.lote} · vence {formatoFecha(l.vence)} · {l.propietario} · {ETIQUETA_ESTADO[l.estado]}</span></span>
        {l.resultado && <ChipResultado r={l.resultado} />}
        {l.ajuste && <span className="text-xs text-gray-700">Ajuste: {l.ajuste === 'PROPUESTO' ? 'espera a Dirección Técnica' : l.ajuste === 'AUTORIZADO' ? 'autorizado' : 'rechazado'}</span>}
      </div>
      {l.miConteo !== undefined && <p className="text-sm text-gray-700">Tú contaste: <strong className="tabular" data-testid="mi-conteo">{l.miConteo}</strong> unidades.</p>}
      {gestiona && l.conteo1 !== undefined && (
        <p className="tabular text-sm text-gray-700" data-testid="conteo-gestion">Sistema: <strong>{l.cantidadSistema}</strong> · 1.er conteo: <strong>{l.conteo1}</strong>{l.conteo2 !== undefined ? <> · 2.º conteo: <strong>{l.conteo2}</strong></> : null}</p>
      )}
      {l.puedeContar && !cerrado && (
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label htmlFor={`c-${l.id}`} className="etiqueta">{l.miConteo === undefined && l.conteo1 === undefined ? 'Cuenta las unidades reales' : 'Segundo conteo (sin mirar el primero)'}</label>
            <input id={`c-${l.id}`} className="campo tabular w-40" inputMode="numeric" value={cantidad} onChange={(e) => setCantidad(e.target.value.replace(/\D/g, ''))} autoComplete="off" data-testid="conteo-cantidad" />
          </div>
          <button type="button" className="btn-primary" disabled={pendiente || cantidad === ''} onClick={() => ejecutar(() => registrarConteoAccion(l.id, Number(cantidad)), { exito: 'Conteo registrado.', alExito: () => setCantidad('') })} data-testid="conteo-registrar"><Hand className="h-5 w-5" aria-hidden />Registrar mi conteo</button>
        </div>
      )}
      {gestiona && conDiferencia && !cerrado && (
        <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3.5" data-testid="resolver-linea">
          <p className="flex items-center gap-1.5 text-sm font-medium text-amber-950"><Siren className="h-4 w-4" aria-hidden />Hay una diferencia: busca la causa antes de corregir</p>
          <p className="text-xs text-gray-700">Revisa ubicación, recepciones, despachos, devoluciones, movimientos internos, lotes, vencimientos y estado. No cambies una cantidad solo para que coincida.</p>
          <label htmlFor={`causa-${l.id}`} className="etiqueta">Causa encontrada</label>
          <div className="flex flex-wrap gap-2"><input id={`causa-${l.id}`} className="campo min-w-0 flex-1" value={causa} onChange={(e) => setCausa(e.target.value)} autoComplete="off" data-testid="conteo-causa" /><button type="button" className="btn-secondary btn-sm" disabled={pendiente || !causa.trim()} onClick={() => ejecutar(() => registrarCausaConteoAccion(l.id, causa), { exito: 'Causa registrada.' })} data-testid="conteo-guardar-causa">Guardar la causa</button></div>
          {!l.ajuste || l.ajuste === 'RECHAZADO' ? (
            <div className="flex flex-wrap gap-2">
              {l.resultado === 'DIFERENCIA_CONFIRMADA' && <button type="button" className="btn-primary btn-sm" onClick={() => setPanel('ajuste')} data-testid="conteo-abrir-ajuste">Proponer un ajuste</button>}
              <button type="button" className="btn-secondary btn-sm" onClick={() => setPanel('escalar')} data-testid="conteo-abrir-escalar">Escalar sin ajustar</button>
            </div>
          ) : <p className="text-sm text-gray-800">Hay un ajuste esperando la decisión de Dirección Técnica.</p>}
          {panel === 'ajuste' && (
            <div className="space-y-2"><label htmlFor={`aj-${l.id}`} className="etiqueta">¿Qué acción se toma?</label><input id={`aj-${l.id}`} className="campo" value={motivo} onChange={(e) => setMotivo(e.target.value)} autoComplete="off" data-testid="conteo-ajuste-motivo" />
              <div className="flex gap-2"><button type="button" className="btn-primary btn-sm" disabled={pendiente || !motivo.trim()} onClick={() => ejecutar(() => proponerAjusteAccion(l.id, motivo), { exito: 'Ajuste propuesto: Dirección Técnica lo decide.', alExito: () => setPanel(null) })} data-testid="conteo-proponer">Proponer el ajuste</button><button type="button" className="btn-secondary btn-sm" onClick={() => setPanel(null)}>Cancelar</button></div></div>
          )}
          {panel === 'escalar' && (
            <div className="space-y-2"><label htmlFor={`es-${l.id}`} className="etiqueta">Evidencia: qué revisaste y qué descartaste</label><input id={`es-${l.id}`} className="campo" value={nota} onChange={(e) => setNota(e.target.value)} autoComplete="off" data-testid="conteo-escalar-nota" />
              <div className="flex gap-2"><button type="button" className="btn-primary btn-sm" disabled={pendiente || !nota.trim()} onClick={() => ejecutar(() => escalarLineaConteoAccion(l.id, nota), { exito: 'Línea escalada con su evidencia.', alExito: () => setPanel(null) })} data-testid="conteo-escalar">Escalar</button><button type="button" className="btn-secondary btn-sm" onClick={() => setPanel(null)}>Cancelar</button></div></div>
          )}
        </div>
      )}
      {l.resultado === 'COINCIDE' && !l.puedeContar && <p className="flex items-center gap-1.5 text-sm text-green-800"><CheckCircle2 className="h-4 w-4" aria-hidden />Coincide con el sistema.</p>}
      {mensaje && <Aviso tipo={mensaje.tipo === 'ok' ? 'ok' : 'error'}>{mensaje.texto}</Aviso>}
    </li>
  )
}

export function LineasConteo({ lineas, gestiona, cerrado }: { lineas: LineaConteoVista[]; gestiona: boolean; cerrado: boolean }) {
  return <ul className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 bg-white" data-testid="lineas-conteo">{lineas.map((l) => <Linea key={l.id} l={l} gestiona={gestiona} cerrado={cerrado} />)}</ul>
}
