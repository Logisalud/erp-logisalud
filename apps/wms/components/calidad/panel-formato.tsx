'use client'

import { FileCheck2 } from 'lucide-react'
import { aprobarVersionFormatoAccion } from '@/app/acciones-entradas'
import { CODIGO_FORMATO, NOMBRE_FORMATO, versionVigente, type FormatoControlado, type VersionFormatoVista } from '@/domain/formatos'
import { formatoFechaHora } from '@/domain/fechas'
import { useAccion } from '../usar-accion'
import { Aviso } from '../entradas/aviso'

/** Formato controlado: la versión que rige y las que esperan la aprobación de Dirección Técnica. Una versión nueva no se activa hasta que ella la aprueba. */
export function PanelFormato({ formato, versiones, puedeAprobar }: { formato: FormatoControlado; versiones: VersionFormatoVista[]; puedeAprobar: boolean }) {
  const { pendiente, mensaje, ejecutar } = useAccion()
  const vigente = versionVigente(versiones)
  const pendientes = versiones.filter((v) => v.estado === 'PENDIENTE')
  if (pendientes.length === 0) return null
  return (
    <section className="rounded-lg border border-amber-300 bg-amber-50 p-4" aria-labelledby="titulo-formato" data-testid="panel-formato">
      <h2 id="titulo-formato" className="flex items-center gap-2 font-heading text-lg font-semibold uppercase tracking-wide text-gray-900"><FileCheck2 className="h-5 w-5 text-amber-800" aria-hidden />Formato {CODIGO_FORMATO[formato]}: versión por aprobar</h2>
      <p className="mt-1 text-sm text-amber-950">{NOMBRE_FORMATO[formato]}. Hoy rige la <strong>versión {vigente}</strong>. Un cambio de formato no se activa hasta que Dirección Técnica (Katia) lo aprueba.</p>
      <ul className="mt-2 space-y-2">
        {pendientes.map((v) => (
          <li key={v.version} className="rounded-md border border-amber-200 bg-white p-3 text-sm text-gray-900" data-testid={`version-pendiente-${v.version}`}>
            <p><strong>Versión {v.version}</strong>{v.propuestaEn ? ` · propuesta el ${formatoFechaHora(v.propuestaEn)}` : ''}</p>
            <p className="mt-0.5 text-gray-700">{v.resumen}</p>
            {puedeAprobar
              ? <button type="button" className="btn-primary btn-sm mt-2" disabled={pendiente} data-testid={`aprobar-version-${v.version}`} onClick={() => ejecutar(() => aprobarVersionFormatoAccion(formato, v.version), { exito: `Listo. La versión ${v.version} rige desde ahora para las actas nuevas.` })}>{pendiente ? 'Aprobando…' : `Aprobar la versión ${v.version}`}</button>
              : <p className="mt-2 text-xs text-gray-600">Espera la aprobación de Dirección Técnica.</p>}
          </li>
        ))}
      </ul>
      {mensaje && <div className="mt-2"><Aviso tipo={mensaje.tipo === 'ok' ? 'ok' : 'error'}>{mensaje.texto}</Aviso></div>}
    </section>
  )
}
