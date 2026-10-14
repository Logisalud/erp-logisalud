'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Plus, Save } from 'lucide-react'
import { guardarPerfilDocumentalAccion } from '@/app/acciones-documentos'
import { PERFIL_POR_DEFECTO, type PerfilDocumental } from '@/domain/documentos'
import { useAccion } from '../usar-accion'
import { Aviso } from '../entradas/aviso'

const vacio = (ruc = ''): PerfilDocumental => ({ ruc, exigeCoa: PERFIL_POR_DEFECTO.exigeCoa, exigeRegistroSanitario: PERFIL_POR_DEFECTO.exigeRegistroSanitario, exigeBpm: PERFIL_POR_DEFECTO.exigeBpm, copias: PERFIL_POR_DEFECTO.copias })

function Fila({ p, nuevo, onListo }: { p: PerfilDocumental; nuevo?: boolean; onListo?: () => void }) {
  const { pendiente, mensaje, ejecutar } = useAccion()
  const [v, setV] = useState(p)
  const ck = (k: 'exigeCoa' | 'exigeRegistroSanitario' | 'exigeBpm', t: string) => (
    <label className="inline-flex min-h-11 items-center gap-2 text-sm text-gray-900"><input type="checkbox" className="h-5 w-5" checked={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.checked })} data-testid={`perfil-${k}`} />{t}</label>
  )
  return (
    <li className="space-y-3 px-4 py-4" data-testid="perfil-fila">
      {nuevo
        ? <div className="max-w-xs"><label htmlFor="perfil-ruc" className="etiqueta">RUC del cliente</label><input id="perfil-ruc" inputMode="numeric" maxLength={11} className="campo tabular" value={v.ruc} onChange={(e) => setV({ ...v, ruc: e.target.value.replace(/\D/g, '') })} data-testid="perfil-ruc" /></div>
        : <p className="font-medium text-gray-900">RUC <span className="tabular">{v.ruc}</span></p>}
      <div className="flex flex-wrap gap-x-6 gap-y-1">{ck('exigeCoa', 'COA del lote')}{ck('exigeRegistroSanitario', 'Registro sanitario')}{ck('exigeBpm', 'BPM del fabricante')}</div>
      <div className="flex flex-wrap items-end gap-3">
        <div><label htmlFor={`copias-${v.ruc}`} className="etiqueta">Copias del paquete</label><input id={`copias-${v.ruc}`} type="number" min={1} max={9} className="campo !w-24" value={v.copias} onChange={(e) => setV({ ...v, copias: Math.max(1, Number(e.target.value) || 1) })} data-testid="perfil-copias" /></div>
        <div className="min-w-[12rem] flex-1"><label htmlFor={`nota-${v.ruc}`} className="etiqueta">Nota <span className="font-normal text-gray-600">(opcional)</span></label><input id={`nota-${v.ruc}`} className="campo" value={v.nota ?? ''} onChange={(e) => setV({ ...v, nota: e.target.value })} data-testid="perfil-nota" /></div>
        <button type="button" className="btn-primary" disabled={pendiente || v.ruc.length !== 11} onClick={() => ejecutar(() => guardarPerfilDocumentalAccion({ ...v, nota: v.nota?.trim() || undefined }), { exito: 'Guardado.', alExito: () => onListo?.() })} data-testid="perfil-guardar"><Save className="h-5 w-5" aria-hidden />{pendiente ? 'Guardando…' : 'Guardar'}</button>
      </div>
      {mensaje && <Aviso tipo={mensaje.tipo === 'ok' ? 'ok' : 'error'}>{mensaje.texto}</Aviso>}
    </li>
  )
}

/** Qué documentos pide cada cliente. Sin una regla propia, se piden COA y registro sanitario (D-82). */
export function PerfilesDocumentalesVista({ perfiles }: { perfiles: PerfilDocumental[] }) {
  const [agregando, setAgregando] = useState(false)
  return (
    <div className="space-y-4" data-testid="perfiles-documentales">
      <Link href="/documentos" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-green-800 underline"><ArrowLeft className="h-4 w-4" aria-hidden />Volver a documentos</Link>
      <Aviso tipo="info">Un cliente sin regla propia recibe <strong className="font-medium">COA y registro sanitario</strong>. Aquí defines las excepciones: qué documentos pide, cuántas copias y una nota para quien arma el paquete. Los criterios de cada cliente que aún no estén confirmados se dejan con la regla general.</Aviso>
      <button type="button" className="btn-secondary" onClick={() => setAgregando(true)} disabled={agregando} data-testid="perfil-nuevo"><Plus className="h-5 w-5" aria-hidden />Agregar cliente</button>
      <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
        {agregando && <Fila p={vacio()} nuevo onListo={() => setAgregando(false)} />}
        {perfiles.map((p) => <Fila key={p.ruc} p={p} />)}
        {perfiles.length === 0 && !agregando && <li className="px-4 py-8 text-center text-sm text-gray-700">Todavía no hay reglas por cliente: todos reciben COA y registro sanitario.</li>}
      </ul>
    </div>
  )
}
