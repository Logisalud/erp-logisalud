'use client'

import { useState } from 'react'
import { CheckCircle2, FileText, Lock, Plus, TriangleAlert } from 'lucide-react'
import { agregarDocumentoAccion, agregarFaltanteAccion, cerrarExpedienteAccion, resolverFaltanteAccion } from '@/app/acciones-entradas'
import { ETIQUETA_DOCUMENTO, type TipoDocumentoExpediente } from '@/domain/entradas'
import type { ExpedienteVista, FaltanteExpediente } from '@/domain/entradas-vistas'
import { formatoFechaHora } from '@/domain/fechas'
import type { Rol } from '@/domain/tipos'
import { useAccion } from '../usar-accion'
import { Aviso } from '../entradas/aviso'

function Faltante({ f, puede }: { f: FaltanteExpediente; puede: boolean }) {
  const { pendiente, mensaje, ejecutar } = useAccion()
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3" data-testid="faltante">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-gray-900">{f.estado === 'ABIERTO' ? <TriangleAlert className="h-4 w-4 shrink-0 text-amber-700" aria-hidden /> : <CheckCircle2 className="h-4 w-4 shrink-0 text-green-700" aria-hidden />}{f.documento}</p>
        <p className="text-sm text-gray-600">Responsable: {f.responsable}{f.estado === 'RESUELTO' ? ` · resuelto${f.nota ? `: ${f.nota}` : ''}` : ''}</p>
      </div>
      {f.estado === 'ABIERTO' && puede && <button type="button" className="btn-secondary btn-sm" disabled={pendiente} onClick={() => ejecutar(() => resolverFaltanteAccion(f.id, undefined), { exito: 'Faltante resuelto.' })} data-testid="resolver-faltante">{pendiente ? '…' : 'Ya está'}</button>}
      {mensaje?.tipo === 'error' && <div className="w-full"><Aviso tipo="error">{mensaje.texto}</Aviso></div>}
    </li>
  )
}

export function PanelExpediente({ exp, roles }: { exp: ExpedienteVista; roles: Rol[] }) {
  const { pendiente, mensaje, ejecutar } = useAccion()
  const [doc, setDoc] = useState('')
  const [tipoDoc, setTipoDoc] = useState('OTRO')
  const [falta, setFalta] = useState('')
  const [resp, setResp] = useState('')
  const puedeCerrar = roles.some((r) => r === 'asistente_dt' || r === 'direccion_tecnica')
  const puedeGestionar = roles.some((r) => r === 'asistente_dt' || r === 'direccion_tecnica' || r === 'jefe_almacen' || r === 'reemplazo_jefe')
  const abiertos = exp.faltantes.filter((f) => f.estado === 'ABIERTO')
  const resueltos = exp.faltantes.filter((f) => f.estado === 'RESUELTO')

  return (
    <div className="space-y-6">
      <section className="card" aria-labelledby="faltantes">
        <h2 id="faltantes" className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">Faltantes <span className="tabular rounded-full bg-gray-100 px-2 py-0.5 text-sm text-gray-700">{abiertos.length}</span></h2>
        {abiertos.length === 0 ? <p className="mt-2 flex items-center gap-2 text-sm text-gray-700" data-testid="sin-faltantes"><CheckCircle2 className="h-4 w-4 text-green-700" aria-hidden />No falta ningún documento.</p>
          : <ul className="mt-1 divide-y divide-gray-100">{abiertos.map((f) => <Faltante key={f.id} f={f} puede={puedeGestionar} />)}</ul>}
        {resueltos.length > 0 && <details className="mt-3"><summary className="cursor-pointer text-sm text-gray-700">Resueltos ({resueltos.length})</summary><ul className="mt-1 divide-y divide-gray-100">{resueltos.map((f) => <Faltante key={f.id} f={f} puede={false} />)}</ul></details>}
        {puedeGestionar && (
          <div className="mt-4 grid gap-3 border-t border-gray-200 pt-4 md:grid-cols-[1.5fr_1fr_auto] md:items-end">
            <div><label htmlFor="falta-doc" className="etiqueta">Documento que falta</label><input id="falta-doc" className="campo" value={falta} onChange={(e) => setFalta(e.target.value)} autoComplete="off" /></div>
            <div><label htmlFor="falta-resp" className="etiqueta">Responsable</label><input id="falta-resp" className="campo" value={resp} onChange={(e) => setResp(e.target.value)} autoComplete="off" /></div>
            <button type="button" className="btn-secondary btn-sm" disabled={pendiente} onClick={() => ejecutar(() => agregarFaltanteAccion(exp.id, falta, resp), { exito: 'Faltante agregado.', alExito: () => { setFalta(''); setResp('') } })} data-testid="agregar-faltante"><Plus className="h-4 w-4" aria-hidden />Agregar faltante</button>
          </div>
        )}
      </section>

      <section className="card" aria-labelledby="documentos">
        <h2 id="documentos" className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">Documentos <span className="tabular rounded-full bg-gray-100 px-2 py-0.5 text-sm text-gray-700">{exp.documentos.length}</span></h2>
        <p className="text-sm text-gray-600">El WMS enlaza los documentos; no los duplica.</p>
        <ul className="mt-2 divide-y divide-gray-100" data-testid="documentos-expediente">
          {exp.documentos.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-x-3 py-2.5 text-sm"><FileText className="h-4 w-4 shrink-0 text-gray-500" aria-hidden /><span className="text-gray-900">{d.descripcion}</span><span className="ml-auto text-gray-600">{ETIQUETA_DOCUMENTO[d.tipo as TipoDocumentoExpediente] ?? d.tipo} · {formatoFechaHora(d.agregadoEn)}</span></li>
          ))}
        </ul>
        {puedeGestionar && (
          <div className="mt-4 grid gap-3 border-t border-gray-200 pt-4 md:grid-cols-[1fr_1.5fr_auto] md:items-end">
            <div><label htmlFor="doc-tipo" className="etiqueta">Tipo</label><select id="doc-tipo" className="campo" value={tipoDoc} onChange={(e) => setTipoDoc(e.target.value)}>{(['FACTURA', 'GUIA_REMISION', 'FORMULARIO_DEVOLUCION', 'OTRO'] as const).map((t) => <option key={t} value={t}>{ETIQUETA_DOCUMENTO[t]}</option>)}</select></div>
            <div><label htmlFor="doc-desc" className="etiqueta">Descripción o número</label><input id="doc-desc" className="campo" value={doc} onChange={(e) => setDoc(e.target.value)} autoComplete="off" /></div>
            <button type="button" className="btn-secondary btn-sm" disabled={pendiente} onClick={() => ejecutar(() => agregarDocumentoAccion(exp.id, tipoDoc, doc), { exito: 'Documento enlazado.', alExito: () => setDoc('') })} data-testid="agregar-documento"><Plus className="h-4 w-4" aria-hidden />Enlazar documento</button>
          </div>
        )}
      </section>

      <section className="card" aria-labelledby="cierre-exp">
        <h2 id="cierre-exp" className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">Cierre</h2>
        {exp.estado === 'CERRADO' ? <Aviso tipo="ok" testid="expediente-cerrado">Expediente cerrado el {formatoFechaHora(exp.cerradoEn)}. Si aparece un faltante nuevo, se reabre.</Aviso> : (
          <div className="mt-2 space-y-3">
            <p className="text-sm text-gray-700">Sandra cierra el expediente cuando no queda ningún faltante.</p>
            {puedeCerrar ? <button type="button" className="btn-primary" disabled={pendiente || abiertos.length > 0} onClick={() => ejecutar(() => cerrarExpedienteAccion(exp.id), { exito: 'Expediente cerrado.' })} data-testid="cerrar-expediente"><Lock className="h-5 w-5" aria-hidden />{pendiente ? 'Cerrando…' : 'Cerrar el expediente'}</button> : <p className="text-sm text-gray-600">Lo cierra Sandra (Asistente de Dirección Técnica).</p>}
            {abiertos.length > 0 && puedeCerrar && <p className="text-xs text-gray-600">Resuelve los {abiertos.length} faltantes para poder cerrar.</p>}
          </div>
        )}
        {mensaje && <div className="mt-3"><Aviso tipo={mensaje.tipo === 'ok' ? 'ok' : 'error'}>{mensaje.texto}</Aviso></div>}
      </section>
    </div>
  )
}
