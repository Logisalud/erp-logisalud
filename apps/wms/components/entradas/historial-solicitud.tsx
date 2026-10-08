'use client'

import { useState } from 'react'
import { History, Save } from 'lucide-react'
import { ajustarSolicitudAccion } from '@/app/acciones-entradas'
import { ETIQUETA_CAMPO_CAMBIO } from '@/domain/entradas'
import type { SolicitudDetalle } from '@/domain/entradas-vistas'
import { formatoFechaHora } from '@/domain/fechas'
import { useAccion } from '../usar-accion'
import { Aviso } from './aviso'

const valor = (campo: string, v?: string) => (v == null || v === '' ? '—' : campo === 'vence' ? v.split('-').reverse().join('/') : v)

/**
 * La solicitud se corrige en el MISMO correlativo, las veces que haga falta. Cada cambio queda campo a campo
 * ("cantidad 50 → 45 · quién · cuándo · por qué"), y cada vuelta guarda una versión.
 */
export function HistorialSolicitud({ solicitud, puedeEditar }: { solicitud: SolicitudDetalle; puedeEditar: boolean }) {
  const { pendiente, mensaje, ejecutar } = useAccion()
  const [guia, setGuia] = useState(solicitud.guiaNumero ?? '')
  const [obs, setObs] = useState(solicitud.observaciones ?? '')
  const [motivo, setMotivo] = useState('')
  const [verVersiones, setVerVersiones] = useState(false)
  const editable = puedeEditar && !solicitud.bloqueadoPorFirmas && solicitud.estado !== 'CERRADA' && solicitud.estado !== 'ANULADA'
  const motivoObligatorio = solicitud.estado !== 'BORRADOR'
  const cambia = guia.trim() !== (solicitud.guiaNumero ?? '') || obs.trim() !== (solicitud.observaciones ?? '')

  function guardar() {
    const ops = [] as { op: 'ENCABEZADO'; campo: 'guia_numero' | 'observaciones'; valor: string }[]
    if (guia.trim() !== (solicitud.guiaNumero ?? '')) ops.push({ op: 'ENCABEZADO', campo: 'guia_numero', valor: guia })
    if (obs.trim() !== (solicitud.observaciones ?? '')) ops.push({ op: 'ENCABEZADO', campo: 'observaciones', valor: obs })
    ejecutar(() => ajustarSolicitudAccion(solicitud.id, ops, motivo || undefined), { exito: 'Cambio guardado en el historial.', alExito: () => setMotivo('') })
  }

  return (
    <div className="mt-3 space-y-4">
      <p className="text-sm text-gray-900" data-testid="version-solicitud">Solicitud <strong className="tabular">{solicitud.numero}</strong> · versión vigente <strong>{solicitud.version}</strong>
        {solicitud.autorizadoPor && <span className="text-gray-600"> · autorizada por {solicitud.autorizadoPor}{solicitud.autorizadoEn ? `, ${formatoFechaHora(solicitud.autorizadoEn)}` : ''}</span>}</p>

      {editable && (
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end">
          <div><label htmlFor="sol-guia" className="etiqueta">Guía</label><input id="sol-guia" className="campo" value={guia} onChange={(e) => setGuia(e.target.value)} autoComplete="off" /></div>
          <div><label htmlFor="sol-obs" className="etiqueta">Observaciones</label><input id="sol-obs" className="campo" value={obs} onChange={(e) => setObs(e.target.value)} autoComplete="off" /></div>
          <div><label htmlFor="sol-motivo" className="etiqueta">{motivoObligatorio ? '¿Por qué el cambio?' : '¿Por qué el cambio? (opcional)'}</label><input id="sol-motivo" className="campo" value={motivo} onChange={(e) => setMotivo(e.target.value)} autoComplete="off" /></div>
          <button type="button" className="btn-secondary btn-sm" disabled={pendiente || !cambia || (motivoObligatorio && !motivo.trim())} onClick={guardar} data-testid="guardar-solicitud"><Save className="h-4 w-4" aria-hidden />Guardar el cambio</button>
        </div>
      )}
      {mensaje && <Aviso tipo={mensaje.tipo === 'ok' ? 'ok' : 'error'}>{mensaje.texto}</Aviso>}

      <div>
        <h3 className="text-sm font-medium text-gray-800">Qué cambió y por qué</h3>
        {solicitud.cambios.length === 0 ? <p className="mt-1 text-sm text-gray-600" data-testid="sin-cambios">Todavía no se cambió nada: la solicitud sigue como se anunció.</p> : (
          <ol className="mt-1 divide-y divide-gray-100 text-sm" data-testid="historial-cambios">
            {solicitud.cambios.map((c) => (
              <li key={c.id} className="py-2.5" data-testid="cambio">
                <p className="text-gray-900">{c.etiqueta && <span className="text-gray-700">{c.etiqueta}: </span>}<strong>{ETIQUETA_CAMPO_CAMBIO[c.campo] ?? c.campo}</strong>{c.campo === 'línea agregada' ? ` ${c.despues}` : <> <span className="tabular">{valor(c.campo, c.antes)} → {valor(c.campo, c.despues)}</span></>}</p>
                <p className="text-xs text-gray-600">{c.usuario} · {formatoFechaHora(c.ts)}{c.motivo ? ` · ${c.motivo}` : ''}</p>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div>
        <button type="button" onClick={() => setVerVersiones((x) => !x)} aria-expanded={verVersiones} className="inline-flex min-h-10 items-center gap-1.5 rounded-md px-2 text-sm text-gray-800 hover:bg-gray-100" data-testid="ver-historial"><History className="h-4 w-4" aria-hidden />{verVersiones ? 'Ocultar las versiones' : `Ver las versiones (${solicitud.versiones.length})`}</button>
        {verVersiones && (
          <ol className="mt-1 divide-y divide-gray-100 text-sm" data-testid="historial-solicitud">
            {solicitud.versiones.map((v) => (
              <li key={v.version} className="flex flex-wrap items-baseline gap-x-3 py-2.5"><span className="tabular font-medium text-gray-900">v{v.version}</span><span className="text-gray-700">{v.motivo ?? 'Sin motivo'}</span><span className="ml-auto text-gray-600">{v.editadoPor} · {formatoFechaHora(v.editadoEn)}</span></li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}
