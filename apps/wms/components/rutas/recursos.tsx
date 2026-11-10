'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ArrowLeft, FileText, Plus, Save, TriangleAlert } from 'lucide-react'
import { cambiarConductorEnDocumentosAccion, guardarDocumentosPersonalAccion, guardarPersonalAccion, guardarVehiculoAccion } from '@/app/acciones-rutas'
import { ETIQUETA_DOCUMENTO, type ConductorEnDocumentos, type DocumentoTipo, type PanoramaRutas, type PersonalTransporte, type VehiculoVista } from '@/domain/rutas'
import { AVISO_TEMPORAL_CONDUCTOR_DOCUMENTOS } from '@/domain/conductor-documentos'
import { CHIP_AVISO, CHIP_NEUTRO, CHIP_OK } from '../estilos-opcion'
import { useAccion } from '../usar-accion'
import { Aviso } from '../entradas/aviso'

const chip = 'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium leading-none whitespace-nowrap'

function DocumentosConductor({ p }: { p: PersonalTransporte }) {
  const { pendiente, mensaje, ejecutar } = useAccion()
  const [tipo, setTipo] = useState<DocumentoTipo>(p.documentoTipo ?? 'DNI')
  const [numero, setNumero] = useState(p.dni ?? '')
  const [licencia, setLicencia] = useState(p.licencia ?? '')
  return (
    <details className="basis-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2" data-testid="documentos-conductor">
      <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium text-gray-900"><FileText className="h-4 w-4" aria-hidden />Documento y licencia {p.dni ? '' : <span className={`${chip} ${CHIP_AVISO}`}><TriangleAlert className="mr-1 h-3.5 w-3.5" aria-hidden />Documento pendiente</span>}</summary>
      <div className="mt-2 grid gap-3 sm:grid-cols-3">
        <div><label htmlFor={`dt-${p.id}`} className="etiqueta">Documento</label>
          <select id={`dt-${p.id}`} className="campo" value={tipo} onChange={(e) => setTipo(e.target.value as DocumentoTipo)} data-testid="documento-tipo">
            {(Object.keys(ETIQUETA_DOCUMENTO) as DocumentoTipo[]).map((t) => <option key={t} value={t}>{ETIQUETA_DOCUMENTO[t]}</option>)}
          </select></div>
        <div><label htmlFor={`dn-${p.id}`} className="etiqueta">Número</label><input id={`dn-${p.id}`} className="campo tabular uppercase" value={numero} onChange={(e) => setNumero(e.target.value)} data-testid="documento-numero" aria-invalid={!!mensaje?.errores?.dni} />{mensaje?.errores?.dni && <p className="mt-1 text-sm text-red-800">{mensaje.errores.dni}</p>}</div>
        <div><label htmlFor={`dl-${p.id}`} className="etiqueta">Licencia de conducir</label><input id={`dl-${p.id}`} className="campo tabular uppercase" value={licencia} onChange={(e) => setLicencia(e.target.value)} data-testid="documento-licencia" aria-invalid={!!mensaje?.errores?.licencia} />{mensaje?.errores?.licencia && <p className="mt-1 text-sm text-red-800">{mensaje.errores.licencia}</p>}</div>
      </div>
      <p className="mt-2 text-sm text-gray-700">La guía electrónica pide el documento y la licencia de quien figura como conductor. Si todavía no los tienes, déjalos vacíos: quedan pendientes.</p>
      <button type="button" className="btn-secondary mt-2" disabled={pendiente} onClick={() => ejecutar(() => guardarDocumentosPersonalAccion({ id: p.id, documentoTipo: tipo, dni: numero, licencia }), { exito: 'Documento y licencia guardados.' })} data-testid="guardar-documentos"><Save className="h-5 w-5" aria-hidden />Guardar documento</button>
      {mensaje && !mensaje.errores && <div className="mt-2"><Aviso tipo={mensaje.tipo === 'ok' ? 'ok' : 'error'}>{mensaje.texto}</Aviso></div>}
    </details>
  )
}

function FilaPersonal({ p, puedeEditar }: { p: PersonalTransporte; puedeEditar: boolean }) {
  const { pendiente, mensaje, ejecutar } = useAccion()
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3" data-testid="fila-personal">
      <span className="min-w-0 flex-1 font-medium text-gray-900">{p.nombre}</span>
      <span className={`${chip} ${p.activo ? CHIP_OK : CHIP_NEUTRO}`}>{p.activo ? 'Disponible' : 'No disponible'}</span>
      {puedeEditar && <button type="button" className="btn-secondary btn-sm" disabled={pendiente} onClick={() => ejecutar(() => guardarPersonalAccion({ id: p.id, nombre: p.nombre, funcion: p.funcion, activo: !p.activo }))}>{p.activo ? 'Marcar no disponible' : 'Marcar disponible'}</button>}
      {mensaje?.tipo === 'error' && <span className="basis-full text-sm text-red-800">{mensaje.texto}</span>}
      {puedeEditar && p.funcion === 'CONDUCTOR' && <DocumentosConductor p={p} />}
    </li>
  )
}

/** D-155 (temporal): quién figura como conductor en la guía electrónica y en el LS-FR.43.03. La ruta guarda siempre al conductor real. */
function ConductorEnDocumentosPanel({ actual, conductores, puedeEditar }: { actual: ConductorEnDocumentos; conductores: PersonalTransporte[]; puedeEditar: boolean }) {
  const { pendiente, mensaje, ejecutar } = useAccion()
  const [persona, setPersona] = useState(actual.personaId ?? '')
  const [motivo, setMotivo] = useState('')
  const cambia = persona !== (actual.personaId ?? '')
  return (
    <section aria-labelledby="t-docs" className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-4" data-testid="conductor-en-documentos">
      <h2 id="t-docs" className="font-heading text-xl font-semibold uppercase tracking-wide text-gray-900">Conductor que figura en los documentos</h2>
      <p className="max-w-3xl text-sm text-amber-900" data-testid="conductor-en-documentos-actual">
        {actual.nombre ? <>La guía electrónica y el formato LS-FR.43.03 llevan a <strong>{actual.nombre}</strong>, sea quien sea el conductor de la ruta.</> : <>La guía electrónica y el formato LS-FR.43.03 llevan al conductor de cada ruta.</>}
        {' '}La ruta y el registro siempre guardan al conductor real.
      </p>
      <p className="flex max-w-3xl items-start gap-2 text-sm text-amber-900"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{AVISO_TEMPORAL_CONDUCTOR_DOCUMENTOS}</p>
      {actual.cambio && <p className="text-sm text-amber-900" data-testid="conductor-en-documentos-cambio">{actual.cambio}</p>}
      {puedeEditar ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label htmlFor="cd-persona" className="etiqueta">Figura en los documentos</label>
            <select id="cd-persona" className="campo" value={persona} onChange={(e) => setPersona(e.target.value)} data-testid="conductor-en-documentos-persona">
              <option value="">El conductor real de cada ruta</option>
              {conductores.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select></div>
          <div><label htmlFor="cd-motivo" className="etiqueta">Motivo del cambio</label><input id="cd-motivo" className="campo" value={motivo} onChange={(e) => setMotivo(e.target.value)} data-testid="conductor-en-documentos-motivo" aria-invalid={!!mensaje?.errores?.motivo} />{mensaje?.errores?.motivo && <p className="mt-1 text-sm text-red-800">{mensaje.errores.motivo}</p>}</div>
          <div className="sm:col-span-2">
            <button type="button" className="btn-primary" disabled={pendiente || !cambia} onClick={() => ejecutar(() => cambiarConductorEnDocumentosAccion(persona || null, motivo), { exito: 'Listo. Los documentos nuevos llevan a quien elegiste; los ya emitidos no cambian. La ruta sigue guardando al conductor real.', alExito: () => setMotivo('') })} data-testid="conductor-en-documentos-guardar"><Save className="h-5 w-5" aria-hidden />{pendiente ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </div>
      ) : <p className="text-sm text-amber-900">Solo el Jefe de Transporte lo cambia.</p>}
      {mensaje && !mensaje.errores && <Aviso tipo={mensaje.tipo === 'ok' ? 'ok' : 'error'}>{mensaje.texto}</Aviso>}
    </section>
  )
}

function NuevoPersonal({ funcion }: { funcion: PersonalTransporte['funcion'] }) {
  const { pendiente, mensaje, ejecutar } = useAccion()
  const [nombre, setNombre] = useState('')
  return (
    <div className="space-y-2 px-4 py-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[12rem] flex-1"><label htmlFor={`np-${funcion}`} className="etiqueta">Agregar {funcion === 'CONDUCTOR' ? 'conductor' : 'auxiliar'}</label><input id={`np-${funcion}`} className="campo" value={nombre} onChange={(e) => setNombre(e.target.value)} data-testid={`nuevo-${funcion}`} /></div>
        <button type="button" className="btn-secondary" disabled={pendiente || !nombre.trim()} onClick={() => ejecutar(() => guardarPersonalAccion({ nombre, funcion, activo: true }), { exito: 'Guardado.', alExito: () => setNombre('') })} data-testid={`guardar-${funcion}`}><Plus className="h-5 w-5" aria-hidden />Agregar</button>
      </div>
      {mensaje && <Aviso tipo={mensaje.tipo === 'ok' ? 'ok' : 'error'}>{mensaje.texto}</Aviso>}
    </div>
  )
}

function NuevoVehiculo() {
  const { pendiente, mensaje, ejecutar } = useAccion()
  const [placa, setPlaca] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [calificado, setCalificado] = useState(false)
  const [frio, setFrio] = useState(false)
  return (
    <div className="space-y-3 px-4 py-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label htmlFor="v-placa" className="etiqueta">Placa</label><input id="v-placa" className="campo tabular uppercase" value={placa} onChange={(e) => setPlaca(e.target.value)} data-testid="vehiculo-placa" aria-invalid={!!mensaje?.errores?.placa} />{mensaje?.errores?.placa && <p className="mt-1 text-sm text-red-800">{mensaje.errores.placa}</p>}</div>
        <div><label htmlFor="v-desc" className="etiqueta">Descripción <span className="font-normal text-gray-600">(opcional)</span></label><input id="v-desc" className="campo" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} data-testid="vehiculo-descripcion" /></div>
      </div>
      <div className="flex flex-wrap gap-x-6">
        <label className="inline-flex min-h-11 items-center gap-2 text-sm text-gray-900"><input type="checkbox" className="h-5 w-5" checked={calificado} onChange={(e) => setCalificado(e.target.checked)} data-testid="vehiculo-calificado" />Vehículo calificado <span className="text-gray-600">(solo informativo)</span></label>
        <label className="inline-flex min-h-11 items-center gap-2 text-sm text-gray-900"><input type="checkbox" className="h-5 w-5" checked={frio} onChange={(e) => setFrio(e.target.checked)} />Apto para cadena de frío</label>
      </div>
      <button type="button" className="btn-secondary" disabled={pendiente || !placa.trim()} onClick={() => ejecutar(() => guardarVehiculoAccion({ placa, descripcion, tipo: 'PROPIO', calificado, aptoCadenaFrio: frio, activo: true }), { exito: 'Vehículo guardado.', alExito: () => { setPlaca(''); setDescripcion(''); setCalificado(false); setFrio(false) } })} data-testid="guardar-vehiculo"><Save className="h-5 w-5" aria-hidden />Guardar vehículo</button>
      {mensaje && !mensaje.errores && <Aviso tipo={mensaje.tipo === 'ok' ? 'ok' : 'error'}>{mensaje.texto}</Aviso>}
    </div>
  )
}

function FilaVehiculo({ v, puedeEditar }: { v: VehiculoVista; puedeEditar: boolean }) {
  const { pendiente, ejecutar } = useAccion()
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3" data-testid="fila-vehiculo">
      <div className="min-w-0 flex-1"><span className="tabular font-medium text-gray-900">{v.placa}</span><span className="ml-2 text-sm text-gray-700">{v.descripcion}</span></div>
      {v.calificado && <span className={`${chip} ${CHIP_OK}`}>Calificado</span>}
      {v.aptoCadenaFrio && <span className={`${chip} ${CHIP_OK}`}>Frío</span>}
      <span className={`${chip} ${v.activo ? CHIP_OK : CHIP_NEUTRO}`}>{v.activo ? 'Disponible' : 'No disponible'}</span>
      {puedeEditar && <button type="button" className="btn-secondary btn-sm" disabled={pendiente} onClick={() => ejecutar(() => guardarVehiculoAccion({ ...v, activo: !v.activo }))}>{v.activo ? 'Marcar no disponible' : 'Marcar disponible'}</button>}
    </li>
  )
}

export function RecursosVista({ panorama, puedeEditar }: { panorama: PanoramaRutas; puedeEditar: boolean }) {
  const grupos: { titulo: string; funcion: PersonalTransporte['funcion'] }[] = [{ titulo: 'Conductores', funcion: 'CONDUCTOR' }, { titulo: 'Auxiliares', funcion: 'AUXILIAR' }]
  return (
    <div className="space-y-6" data-testid="recursos-ruta">
      <Link href="/rutas" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-green-800 underline"><ArrowLeft className="h-4 w-4" aria-hidden />Volver a rutas</Link>
      {panorama.conductorEnDocumentos && <ConductorEnDocumentosPanel actual={panorama.conductorEnDocumentos} conductores={panorama.personal.filter((p) => p.funcion === 'CONDUCTOR' && p.activo)} puedeEditar={puedeEditar} />}
      {grupos.map((g) => (
        <section key={g.funcion} aria-labelledby={`t-${g.funcion}`} className="space-y-2">
          <h2 id={`t-${g.funcion}`} className="font-heading text-xl font-semibold uppercase tracking-wide text-gray-900">{g.titulo}</h2>
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
            {panorama.personal.filter((p) => p.funcion === g.funcion).map((p) => <FilaPersonal key={p.id} p={p} puedeEditar={puedeEditar} />)}
            {puedeEditar && <li className="list-none"><NuevoPersonal funcion={g.funcion} /></li>}
          </ul>
        </section>
      ))}
      <section aria-labelledby="t-vehiculos" className="space-y-2">
        <h2 id="t-vehiculos" className="font-heading text-xl font-semibold uppercase tracking-wide text-gray-900">Vehículos</h2>
        <p className="max-w-3xl text-sm text-gray-700">El vehículo para cada ruta lo eliges tú por experiencia: el sistema no valida si es «calificado». Esa marca es solo informativa.</p>
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
          {panorama.vehiculos.map((v) => <FilaVehiculo key={v.id} v={v} puedeEditar={puedeEditar} />)}
          {puedeEditar && <li className="list-none"><NuevoVehiculo /></li>}
        </ul>
      </section>
    </div>
  )
}
