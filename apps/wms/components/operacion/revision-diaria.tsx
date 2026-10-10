'use client'

import { useState } from 'react'
import { AlertTriangle, Check, CheckCircle2, CircleDashed, ClipboardList, Flag, MapPin, Plus, ShieldAlert, UserRound } from 'lucide-react'
import {
  cerrarRevisionAccion, iniciarRevisionAccion, marcarFocoAccion, registrarPendienteAccion, resolverPendienteAccion, verificarPendienteAccion,
} from '@/app/acciones-operacion'
import {
  ETIQUETA_ESTADO_PENDIENTE, ETIQUETA_FOCO, FOCOS, pendientesVivos, puedeCerrarRevision, puedeHacerRevision, puedeResolverPendiente,
  type FocoRevision, type PendienteVista, type PersonaEquipo, type RevisionDiaria,
} from '@/domain/operacion'
import { formatoFecha } from '@/domain/fechas'
import type { Rol } from '@/domain/tipos'
import { CHIP_AVISO, CHIP_OK, CHIP_SIN_MARCAR, PILDORA_ACTIVA, PILDORA_INACTIVA_HOVER } from '../estilos-opcion'
import { Aviso } from '../entradas/aviso'
import { useAccion } from '../usar-accion'

/** La revisión diaria (INV-04): un recorrido corto con 4 focos. Solo registra pendientes, cada uno con su responsable; no mueve stock. */
export function RevisionDiariaVista({ hoy, revision, vivos, equipo, historial, roles, actorId }: {
  hoy: string; revision: RevisionDiaria | null; vivos: PendienteVista[]; equipo: PersonaEquipo[]; historial: RevisionDiaria[]; roles: Rol[]; actorId: string
}) {
  const { pendiente, mensaje, ejecutar } = useAccion()
  const jefe = puedeHacerRevision(roles)
  const [formFoco, setFormFoco] = useState<FocoRevision | null>(null)
  const [soloImportantes, setSoloImportantes] = useState(false)
  const [notaCierre, setNotaCierre] = useState('')
  const abierta = revision?.estado === 'ABIERTA'
  const cierre = revision ? puedeCerrarRevision(revision) : { puede: false }
  const lista = pendientesVivos(vivos).filter((p) => !soloImportantes || p.critico || p.afectaProducto)
  const mios = vivos.filter((p) => p.responsableId === actorId && p.estado === 'ABIERTO')

  return (
    <div className="space-y-6">
      {mios.length > 0 && !jefe && (
        <Aviso tipo="atencion" testid="mis-pendientes"><span className="font-medium">Tienes {mios.length} {mios.length === 1 ? 'pendiente' : 'pendientes'} por resolver.</span> Mira la lista de abajo y marca como resuelto lo que ya quedó.</Aviso>
      )}

      <section aria-labelledby="h-hoy" className="rounded-xl border border-gray-200 bg-white p-4 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="h-hoy" className="font-heading text-xl font-medium tracking-wide text-gray-900">Revisión de hoy</h2>
            <p className="tabular text-sm text-gray-700">{formatoFecha(hoy)}{revision ? ` · ${revision.numero}` : ''}</p>
          </div>
          {revision && <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${revision.estado === 'CERRADA' ? CHIP_OK : CHIP_AVISO}`} data-testid="estado-revision">{revision.estado === 'CERRADA' ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> : <CircleDashed className="h-3.5 w-3.5" aria-hidden />}{revision.estado === 'CERRADA' ? 'Cerrada' : 'En curso'}</span>}
        </div>

        {!revision && (
          <div className="mt-4 space-y-3" data-testid="revision-sin-empezar">
            <p className="text-gray-800">Todavía no se hizo el recorrido de hoy. Son cuatro focos y toma entre 10 y 15 minutos. Esta revisión no mueve stock ni decide estados: solo anota pendientes con su responsable.</p>
            {jefe ? <button type="button" className="btn-primary w-full sm:w-auto" disabled={pendiente} onClick={() => ejecutar(() => iniciarRevisionAccion(), { exito: 'Revisión iniciada.' })} data-testid="iniciar-revision"><ClipboardList className="h-5 w-5" aria-hidden />Empezar la revisión de hoy</button>
              : <p className="text-sm text-gray-700">La empieza el Jefe de Almacén o su reemplazo.</p>}
          </div>
        )}

        {revision && (
          <div className="mt-4">
            <p className="tabular text-sm font-medium text-gray-900" data-testid="progreso-revision">{revision.focos.length} de {FOCOS.length} focos revisados</p>
            <ol className="mt-2 divide-y divide-gray-100 rounded-lg border border-gray-200" data-testid="focos">
              {FOCOS.map((f, i) => {
                const marca = revision.focos.find((x) => x.foco === f.foco)
                const susPend = revision.pendientes.filter((p) => p.foco === f.foco)
                return (
                  <li key={f.foco} className="space-y-2 p-3 md:p-4" data-testid="foco" data-foco={f.foco}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="font-medium text-gray-900">{i + 1}. {f.titulo}</h3>
                        <p className="text-sm text-gray-700">{f.guia}</p>
                      </div>
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${marca?.resultado === 'SIN_PROBLEMAS' ? CHIP_OK : marca ? CHIP_AVISO : CHIP_SIN_MARCAR}`} data-testid="resultado-foco">
                        {marca?.resultado === 'SIN_PROBLEMAS' ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> : marca ? <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> : <CircleDashed className="h-3.5 w-3.5" aria-hidden />}
                        {marca?.resultado === 'SIN_PROBLEMAS' ? 'Sin problemas' : marca ? 'Con pendientes' : 'Sin revisar'}
                      </span>
                    </div>
                    {susPend.length > 0 && <ul className="space-y-1.5">{susPend.map((p) => <li key={p.id}><FilaPendiente p={p} /></li>)}</ul>}
                    {abierta && jefe && (
                      <div className="flex flex-wrap gap-2">
                        <button type="button" className="btn-secondary btn-sm" disabled={pendiente || susPend.some((p) => p.estado === 'ABIERTO')} onClick={() => ejecutar(() => marcarFocoAccion(revision.id, f.foco, 'SIN_PROBLEMAS'), { exito: `${f.titulo}: sin problemas.` })} data-testid="foco-sin-problemas"><Check className="h-4 w-4" aria-hidden />Sin problemas</button>
                        <button type="button" className={`inline-flex min-h-10 items-center gap-1.5 rounded-full border px-4 text-sm font-medium ${formFoco === f.foco ? PILDORA_ACTIVA : PILDORA_INACTIVA_HOVER}`} aria-expanded={formFoco === f.foco} onClick={() => setFormFoco(formFoco === f.foco ? null : f.foco)} data-testid="foco-agregar-pendiente"><Plus className="h-4 w-4" aria-hidden />Anotar un pendiente</button>
                      </div>
                    )}
                    {abierta && jefe && formFoco === f.foco && (
                      <FormPendiente equipo={equipo} alGuardar={(d) => ejecutar(() => registrarPendienteAccion(revision.id, { ...d, foco: f.foco }), { exito: 'Pendiente anotado.', alExito: () => setFormFoco(null) })} ocupado={pendiente} />
                    )}
                  </li>
                )
              })}
            </ol>

            {abierta && jefe && (
              <div className="mt-4 space-y-2">
                <label htmlFor="nota-cierre" className="etiqueta">Nota de cierre <span className="font-normal text-gray-700">(opcional)</span></label>
                <input id="nota-cierre" className="campo" value={notaCierre} onChange={(e) => setNotaCierre(e.target.value)} autoComplete="off" data-testid="nota-cierre" />
                <button type="button" className="btn-primary w-full sm:w-auto" disabled={pendiente || !cierre.puede} onClick={() => ejecutar(() => cerrarRevisionAccion(revision.id, notaCierre), { exito: 'Revisión cerrada.' })} data-testid="cerrar-revision"><Check className="h-5 w-5" aria-hidden />Cerrar la revisión</button>
                {!cierre.puede && <p className="text-sm text-gray-700" data-testid="motivo-no-cierra">{cierre.motivo}</p>}
              </div>
            )}
            {revision.estado === 'CERRADA' && <Aviso tipo="ok" testid="revision-cerrada">Revisión cerrada.{revision.notaCierre ? ` ${revision.notaCierre}` : ''} Los pendientes siguen abajo hasta que se resuelvan y se verifiquen.</Aviso>}
          </div>
        )}
        {mensaje && <div className="mt-3"><Aviso tipo={mensaje.tipo === 'ok' ? 'ok' : 'error'}>{mensaje.texto}</Aviso></div>}
      </section>

      <section aria-labelledby="h-vivos" className="rounded-xl border border-gray-200 bg-white p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="h-vivos" className="font-heading text-xl font-medium tracking-wide text-gray-900">Pendientes por resolver <span className="tabular rounded-full bg-gray-100 px-2 py-0.5 text-sm text-gray-700">{vivos.length}</span></h2>
          <button type="button" aria-pressed={soloImportantes} onClick={() => setSoloImportantes((v) => !v)} className={`inline-flex min-h-10 items-center gap-1.5 rounded-full border px-4 text-sm font-medium ${soloImportantes ? PILDORA_ACTIVA : PILDORA_INACTIVA_HOVER}`} data-testid="solo-importantes"><Flag className="h-4 w-4" aria-hidden />Solo los importantes</button>
        </div>
        <p className="mt-1 text-sm text-gray-700">Se arrastran de una revisión a la siguiente hasta que se resuelvan y el Jefe los verifique. Importante = crítico o que puede afectar producto.</p>
        {lista.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-700" data-testid="sin-pendientes">{vivos.length === 0 ? 'No hay pendientes. Buen trabajo.' : 'No hay pendientes importantes.'}</p>
        ) : (
          <ul className="mt-3 divide-y divide-gray-100 rounded-lg border border-gray-200" data-testid="lista-pendientes">
            {lista.map((p) => (
              <li key={p.id} className="p-3 md:p-4" data-testid="pendiente" data-estado={p.estado}>
                <FilaPendiente p={p} conFecha />
                <AccionesPendiente p={p} puedeResolver={puedeResolverPendiente(roles, actorId, p)} esJefe={jefe} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {historial.length > 0 && (
        <section aria-labelledby="h-hist">
          <h2 id="h-hist" className="font-heading text-xl font-medium tracking-wide text-gray-900">Revisiones anteriores</h2>
          <ul className="mt-3 divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white" data-testid="historial-revisiones">
            {historial.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
                <span className="tabular font-medium text-gray-900">{r.numero}</span>
                <span className="tabular text-gray-700">{formatoFecha(r.fecha)}</span>
                <span className="text-gray-700">{r.estado === 'CERRADA' ? 'Cerrada' : 'En curso'} · {r.responsable}</span>
                <span className="tabular ml-auto text-gray-700">{r.pendientes.length} {r.pendientes.length === 1 ? 'pendiente' : 'pendientes'}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function FilaPendiente({ p, conFecha }: { p: PendienteVista; conFecha?: boolean }) {
  return (
    <div className="space-y-1">
      <p className="text-[15px] text-gray-900">{p.descripcion}</p>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-700">
        <span className="inline-flex items-center gap-1"><UserRound className="h-3.5 w-3.5" aria-hidden />{p.responsable}</span>
        {conFecha && <span>{ETIQUETA_FOCO[p.foco]} · {formatoFecha(p.fecha)}</span>}
        {p.ubicacion && <span className="tabular inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" aria-hidden />{p.ubicacion}</span>}
        {p.critico && <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-900"><Flag className="h-3 w-3" aria-hidden />Crítico</span>}
        {p.afectaProducto && <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900"><ShieldAlert className="h-3 w-3" aria-hidden />Puede afectar producto</span>}
        <span className="rounded-full border border-gray-300 bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-800" data-testid="estado-pendiente">{ETIQUETA_ESTADO_PENDIENTE[p.estado]}</span>
      </p>
      {p.notaResolucion && <p className="text-sm text-gray-700">{p.notaResolucion}</p>}
    </div>
  )
}

function AccionesPendiente({ p, puedeResolver, esJefe }: { p: PendienteVista; puedeResolver: boolean; esJefe: boolean }) {
  const { pendiente, mensaje, ejecutar } = useAccion()
  const [nota, setNota] = useState('')
  const [abierto, setAbierto] = useState<'resolver' | 'reabrir' | null>(null)
  if (p.estado === 'ABIERTO' && !puedeResolver) return null
  if (p.estado === 'RESUELTO' && !esJefe) return null
  const hecho = () => { setAbierto(null); setNota('') }
  return (
    <div className="mt-2 space-y-2">
      {p.estado === 'ABIERTO' && (
        <>
          {abierto !== 'resolver' ? <button type="button" className="btn-secondary btn-sm" onClick={() => setAbierto('resolver')} data-testid="pendiente-resolver"><Check className="h-4 w-4" aria-hidden />Marcar como resuelto</button> : (
            <div className="space-y-2">
              <label htmlFor={`res-${p.id}`} className="etiqueta">¿Qué se hizo?</label>
              <input id={`res-${p.id}`} className="campo" value={nota} onChange={(e) => setNota(e.target.value)} autoComplete="off" data-testid="pendiente-nota" />
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-primary btn-sm" disabled={pendiente} onClick={() => ejecutar(() => resolverPendienteAccion(p.id, nota), { exito: 'Pendiente resuelto: queda por verificar.', alExito: hecho })} data-testid="pendiente-confirmar-resolver">Resuelto</button>
                <button type="button" className="btn-secondary btn-sm" onClick={hecho}>Cancelar</button>
              </div>
            </div>
          )}
        </>
      )}
      {p.estado === 'RESUELTO' && esJefe && (
        abierto !== 'reabrir' ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary btn-sm" disabled={pendiente} onClick={() => ejecutar(() => verificarPendienteAccion(p.id, true, undefined), { exito: 'Pendiente verificado.' })} data-testid="pendiente-verificar"><CheckCircle2 className="h-4 w-4" aria-hidden />Conforme</button>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setAbierto('reabrir')} data-testid="pendiente-reabrir">No quedó resuelto</button>
          </div>
        ) : (
          <div className="space-y-2">
            <label htmlFor={`reab-${p.id}`} className="etiqueta">¿Qué falta?</label>
            <input id={`reab-${p.id}`} className="campo" value={nota} onChange={(e) => setNota(e.target.value)} autoComplete="off" data-testid="pendiente-nota-reabrir" />
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-primary btn-sm" disabled={pendiente || !nota.trim()} onClick={() => ejecutar(() => verificarPendienteAccion(p.id, false, nota), { exito: 'Pendiente reabierto.', alExito: hecho })} data-testid="pendiente-confirmar-reabrir">Reabrir</button>
              <button type="button" className="btn-secondary btn-sm" onClick={hecho}>Cancelar</button>
            </div>
          </div>
        )
      )}
      {mensaje?.tipo === 'error' && <Aviso tipo="error">{mensaje.texto}</Aviso>}
    </div>
  )
}

function FormPendiente({ equipo, alGuardar, ocupado }: { equipo: PersonaEquipo[]; alGuardar: (d: { descripcion: string; responsableId: string; critico: boolean; afectaProducto: boolean; ubicacion?: string }) => void; ocupado: boolean }) {
  const [descripcion, setDescripcion] = useState('')
  const [responsableId, setResponsableId] = useState('')
  const [critico, setCritico] = useState(false)
  const [afecta, setAfecta] = useState(false)
  const [ubicacion, setUbicacion] = useState('')
  const listo = descripcion.trim().length > 0 && responsableId !== ''
  return (
    <div className="space-y-3 rounded-lg bg-gray-50 p-3" data-testid="form-pendiente">
      <div>
        <label htmlFor="pend-desc" className="etiqueta">¿Qué pasó?</label>
        <textarea id="pend-desc" rows={2} className="campo !min-h-20 py-2" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} data-testid="pendiente-descripcion" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="pend-resp" className="etiqueta">¿Quién lo resuelve?</label>
          <select id="pend-resp" className="campo" value={responsableId} onChange={(e) => setResponsableId(e.target.value)} data-testid="pendiente-responsable">
            <option value="">Elige a una persona</option>
            {equipo.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="pend-ub" className="etiqueta">Ubicación <span className="font-normal text-gray-700">(opcional)</span></label>
          <input id="pend-ub" className="campo" value={ubicacion} onChange={(e) => setUbicacion(e.target.value)} autoComplete="off" placeholder="Por ejemplo A-12.1" data-testid="pendiente-ubicacion" />
        </div>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        <label className="flex min-h-10 items-center gap-2 text-sm text-gray-900"><input type="checkbox" className="h-5 w-5" checked={critico} onChange={(e) => setCritico(e.target.checked)} data-testid="pendiente-critico" />Es crítico</label>
        <label className="flex min-h-10 items-center gap-2 text-sm text-gray-900"><input type="checkbox" className="h-5 w-5" checked={afecta} onChange={(e) => setAfecta(e.target.checked)} data-testid="pendiente-afecta" />Puede afectar producto (avisa a Dirección Técnica)</label>
      </div>
      <button type="button" className="btn-primary w-full sm:w-auto" disabled={ocupado || !listo} onClick={() => alGuardar({ descripcion, responsableId, critico, afectaProducto: afecta, ubicacion: ubicacion || undefined })} data-testid="pendiente-guardar"><Plus className="h-5 w-5" aria-hidden />Registrar pendiente</button>
      {!listo && <p className="text-xs text-gray-700">Cuenta qué pasó y elige quién lo resuelve: todo pendiente tiene un responsable.</p>}
    </div>
  )
}
