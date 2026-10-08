'use client'

import { useState } from 'react'
import { History, Save } from 'lucide-react'
import { editarSolicitudAccion } from '@/app/acciones-entradas'
import type { IngresoDetalle } from '@/domain/entradas-vistas'
import { formatoFechaHora } from '@/domain/fechas'
import { useAccion } from '../usar-accion'
import { Aviso } from './aviso'

/** Solicitud de Ingreso (LS-FR.05.05): la prellena el sistema; se puede editar y cada versión queda guardada. */
export function Solicitud({ ingreso, puedeEditar }: { ingreso: IngresoDetalle; puedeEditar: boolean }) {
  const { pendiente, mensaje, ejecutar } = useAccion()
  const actual = ingreso.versiones[0]
  const [obs, setObs] = useState(String(actual?.datos.observaciones ?? ''))
  const [motivo, setMotivo] = useState('')
  const [abierto, setAbierto] = useState(false)

  return (
    <div className="mt-3 space-y-4">
      <p className="text-sm text-gray-700">El sistema la llena con lo que ya sabe. Si cambias algo, escribe por qué: cada versión se guarda con quién y cuándo.</p>
      <p className="text-sm text-gray-900" data-testid="version-solicitud">Versión vigente: <strong>{ingreso.solicitudVersion}</strong>{actual && <span className="text-gray-600"> · {actual.editadoPor}, {formatoFechaHora(actual.editadoEn)}</span>}</p>
      {puedeEditar && (
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <div><label htmlFor="sol-obs" className="etiqueta">Observaciones de la solicitud</label><input id="sol-obs" className="campo" value={obs} onChange={(e) => setObs(e.target.value)} autoComplete="off" /></div>
          <div><label htmlFor="sol-motivo" className="etiqueta">¿Por qué el cambio?</label><input id="sol-motivo" className="campo" value={motivo} onChange={(e) => setMotivo(e.target.value)} autoComplete="off" /></div>
          <button type="button" className="btn-secondary btn-sm" disabled={pendiente || !motivo.trim()} onClick={() => ejecutar(() => editarSolicitudAccion(ingreso.id, { observaciones: obs }, motivo), { exito: 'Nueva versión guardada.', alExito: () => setMotivo('') })} data-testid="guardar-solicitud"><Save className="h-4 w-4" aria-hidden />Guardar versión</button>
        </div>
      )}
      {mensaje && <Aviso tipo={mensaje.tipo === 'ok' ? 'ok' : 'error'}>{mensaje.texto}</Aviso>}
      <div>
        <button type="button" onClick={() => setAbierto((x) => !x)} aria-expanded={abierto} className="inline-flex min-h-10 items-center gap-1.5 rounded-md px-2 text-sm text-gray-800 hover:bg-gray-100" data-testid="ver-historial"><History className="h-4 w-4" aria-hidden />{abierto ? 'Ocultar el historial' : `Ver el historial (${ingreso.versiones.length})`}</button>
        {abierto && (
          <ol className="mt-1 divide-y divide-gray-100 text-sm" data-testid="historial-solicitud">
            {ingreso.versiones.map((v) => (
              <li key={v.version} className="flex flex-wrap items-baseline gap-x-3 py-2.5"><span className="tabular font-medium text-gray-900">v{v.version}</span><span className="text-gray-700">{v.motivo ?? 'Sin motivo'}</span><span className="ml-auto text-gray-600">{v.editadoPor} · {formatoFechaHora(v.editadoEn)}</span></li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}
