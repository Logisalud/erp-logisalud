'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowUp, Ban, CheckCircle2, FileText, History, ListOrdered, Plus, Save, Trash2, TriangleAlert } from 'lucide-react'
import { cancelarRutaAccion, confirmarRutaAccion, planificarRutaAccion } from '@/app/acciones-rutas'
import {
  ETIQUETA_ESTADO_RUTA, RUTA_EDITABLE, filtrarPedidosPlanificables, fueraDeCorte, ordenSugerido, validarPlan,
  type PanoramaRutas, type PedidoPlanificable, type PlanParada, type RutaVista,
} from '@/domain/rutas'
import { formatoFechaHora } from '@/domain/fechas'
import type { RegistroLsFrVista } from '@/domain/ls-fr-43-03'
import { CHIP_AVISO } from '../estilos-opcion'
import { useAccion } from '../usar-accion'
import { Aviso } from '../entradas/aviso'
import { Buscador } from '../inventario/mover/piezas'
import { ChipEstadoRuta, ChipStockParada } from './chips-ruta'
import { PanelLsFr } from './panel-ls-fr'

const base = 'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium leading-none whitespace-nowrap'
const icono = 'inline-flex h-11 w-11 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-800 hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-300'
const diaLargo = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })

/** Una ruta ya cerrada o en ejecución: se mira, no se edita. */
function VistaRuta({ ruta, registro, permisos }: { ruta: RutaVista; registro: RegistroLsFrVista | null; permisos: PermisosLsFr }) {
  return (
    <div className="space-y-4" data-testid="ruta-solo-lectura">
      <Aviso tipo="info">Esta ruta no se puede cambiar desde aquí{' '}({ETIQUETA_ESTADO_RUTA[ruta.estado].toLowerCase()}).{ruta.motivoCancelacion ? ` Motivo: ${ruta.motivoCancelacion}.` : ''}</Aviso>
      <TablaParadas paradas={ruta.paradas} />
      <PanelLsFr ruta={ruta} registro={registro} puedeCerrar={permisos.cerrar} puedeRegistrar={permisos.registrar} />
    </div>
  )
}

function TablaParadas({ paradas }: { paradas: RutaVista['paradas'] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="w-full text-sm" data-testid="tabla-paradas-lectura">
        <caption className="sr-only">Paradas de la ruta</caption>
        <thead className="border-b border-gray-200 bg-gray-50 text-left text-gray-700"><tr><th scope="col" className="px-3 py-2 font-medium">N.º</th><th scope="col" className="px-3 py-2 font-medium">Cliente</th><th scope="col" className="px-3 py-2 font-medium">Pedido</th><th scope="col" className="px-3 py-2 text-right font-medium">Unidades</th><th scope="col" className="px-3 py-2 font-medium">Stock</th></tr></thead>
        <tbody className="divide-y divide-gray-100">{paradas.map((p) => (
          <tr key={p.id}><td className="tabular px-3 py-2">{p.secuencia}</td><td className="px-3 py-2 font-medium text-gray-900">{p.cliente}</td><td className="tabular px-3 py-2">{p.pedidoNumero}</td><td className="tabular px-3 py-2 text-right">{p.unidades}</td><td className="px-3 py-2"><ChipStockParada stock={p.stock} /></td></tr>
        ))}</tbody>
      </table>
    </div>
  )
}

export interface PermisosLsFr { cerrar: boolean; registrar: boolean }

export function EditorRuta({ ruta, panorama, registro = null, soloLectura = false, permisos = { cerrar: false, registrar: false } }: { ruta: RutaVista; panorama: PanoramaRutas; registro?: RegistroLsFrVista | null; soloLectura?: boolean; permisos?: PermisosLsFr }) {
  const router = useRouter()
  const { pendiente, mensaje, ejecutar } = useAccion()
  const editable = RUTA_EDITABLE.includes(ruta.estado) && !soloLectura
  const [fecha, setFecha] = useState(ruta.fecha)
  const [vehiculoId, setVehiculoId] = useState(ruta.vehiculo?.id ?? '')
  const [conductorId, setConductorId] = useState(ruta.conductor?.id ?? '')
  const [auxiliarId, setAuxiliarId] = useState(ruta.auxiliar?.id ?? '')
  const [paradas, setParadas] = useState<PlanParada[]>(ruta.paradas.map((p) => ({ pedidoId: p.pedidoId, excepcionCorte: p.excepcionCorte, motivoExcepcion: p.motivoExcepcion })))
  const [motivo, setMotivo] = useState('')
  const [q, setQ] = useState('')
  const [cancelando, setCancelando] = useState(false)
  const [motivoCancelar, setMotivoCancelar] = useState('')
  const [aviso, setAviso] = useState<string | null>(null)

  const pedido = useMemo(() => new Map(panorama.pedidos.map((p) => [p.pedidoId, p])), [panorama.pedidos])
  const vehiculo = panorama.vehiculos.find((v) => v.id === vehiculoId)
  const guardadas = ruta.paradas.map((p) => p.pedidoId)
  const sucio = fecha !== ruta.fecha || vehiculoId !== (ruta.vehiculo?.id ?? '') || conductorId !== (ruta.conductor?.id ?? '') || auxiliarId !== (ruta.auxiliar?.id ?? '')
    || paradas.length !== guardadas.length || paradas.some((p, i) => p.pedidoId !== guardadas[i] || !!p.excepcionCorte !== !!ruta.paradas[i]?.excepcionCorte || (p.motivoExcepcion ?? '') !== (ruta.paradas[i]?.motivoExcepcion ?? ''))
  const enOtraRuta = useMemo(() => new Map(panorama.pedidos.filter((p) => p.enRuta && !guardadas.includes(p.pedidoId)).map((p) => [p.pedidoId, p.enRuta!])), [panorama.pedidos, guardadas])
  const errores = useMemo(() => validarPlan({ hoy: panorama.hoy, corte: panorama.corte, plan: { fecha, vehiculoId, conductorId, auxiliarId, paradas }, vehiculo, pedidos: pedido, enOtraRuta }), [panorama, fecha, vehiculoId, conductorId, auxiliarId, paradas, vehiculo, pedido, enOtraRuta])
  const requiereMotivo = ruta.estado === 'PLANIFICADA' && sucio

  if (!editable) return <VistaRuta ruta={ruta} registro={registro} permisos={permisos} />

  const mover = (i: number, d: -1 | 1) => setParadas((a) => { const b = [...a]; const j = i + d; if (j < 0 || j >= b.length) return a; [b[i], b[j]] = [b[j], b[i]]; return b })
  const quitar = (i: number) => setParadas((a) => a.filter((_, k) => k !== i))
  const agregar = (p: PedidoPlanificable) => setParadas((a) => [...a, { pedidoId: p.pedidoId }])
  const marcar = (i: number, cambio: Partial<PlanParada>) => setParadas((a) => a.map((x, k) => (k === i ? { ...x, ...cambio } : x)))
  const sugerir = () => setParadas((a) => ordenSugerido(a.map((p) => ({ ...p, ...pedido.get(p.pedidoId)!, cliente: pedido.get(p.pedidoId)?.cliente ?? '' }))).map((p) => ({ pedidoId: p.pedidoId, excepcionCorte: p.excepcionCorte, motivoExcepcion: p.motivoExcepcion })))

  const guardar = () => { setAviso(null); ejecutar(() => planificarRutaAccion(ruta.id, { fecha, vehiculoId: vehiculoId || undefined, conductorId: conductorId || undefined, auxiliarId: auxiliarId || undefined, paradas, motivo: motivo || undefined }), {
    exito: 'Plan guardado.', alExito: (r) => { setMotivo(''); if (r.bloqueadosPorStock.length) setAviso(`No hay stock suficiente para: ${r.bloqueadosPorStock.join(', ')}. Quítalos de la ruta o espera el ingreso de stock antes de confirmarla.`) },
  }) }
  const confirmar = () => ejecutar(() => confirmarRutaAccion(ruta.id), { exito: 'Ruta confirmada: ya nació su registro LS-FR.43.03.' })
  const cancelar = () => ejecutar(() => cancelarRutaAccion(ruta.id, motivoCancelar), { refrescar: false, alExito: () => router.push('/rutas') })

  const disponibles = filtrarPedidosPlanificables(panorama.pedidos.filter((p) => !paradas.some((x) => x.pedidoId === p.pedidoId)), q)
  const motivoBloqueo = (p: PedidoPlanificable) => p.enRuta ? `Ya está en ${p.enRuta}` : p.cambioPorRevisar ? 'Cambió en Pedidos: revísalo primero' : p.sinCatalogo.length ? `Producto desconocido (${p.sinCatalogo[0]})` : null

  return (
    <div className="space-y-5" data-testid="editor-ruta">
      <Link href="/rutas" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-green-800 underline"><ArrowLeft className="h-4 w-4" aria-hidden />Volver a rutas</Link>

      <section className="rounded-lg border border-gray-200 bg-white p-4 md:p-5" aria-label="Datos de la ruta">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-heading text-xl font-semibold uppercase tracking-wide text-gray-900"><span className="tabular" data-testid="ruta-numero">{ruta.numero}</span> <span className="text-base normal-case tracking-normal text-gray-600">· {diaLargo(fecha)}</span></h2>
          <div className="flex items-center gap-2"><span className="text-xs text-gray-600">Versión {ruta.version}</span><ChipEstadoRuta estado={ruta.estado} /></div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div><label htmlFor="r-fecha" className="etiqueta">Fecha</label><input id="r-fecha" type="date" className="campo" min={panorama.hoy} value={fecha} onChange={(e) => setFecha(e.target.value)} data-testid="ruta-fecha" /></div>
          <div><label htmlFor="r-veh" className="etiqueta">Vehículo</label>
            <select id="r-veh" className="campo" value={vehiculoId} onChange={(e) => setVehiculoId(e.target.value)} data-testid="ruta-vehiculo">
              <option value="">Elige el vehículo…</option>
              {panorama.vehiculos.filter((v) => v.activo || v.id === vehiculoId).map((v) => <option key={v.id} value={v.id}>{v.placa}{v.descripcion ? ` — ${v.descripcion}` : ''}{v.calificado ? ' · calificado' : ''}{v.aptoCadenaFrio ? ' · frío' : ''}</option>)}
            </select></div>
          <div><label htmlFor="r-cond" className="etiqueta">Conductor</label>
            <select id="r-cond" className="campo" value={conductorId} onChange={(e) => setConductorId(e.target.value)} data-testid="ruta-conductor">
              <option value="">Elige el conductor…</option>
              {panorama.personal.filter((p) => p.funcion === 'CONDUCTOR' && (p.activo || p.id === conductorId)).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select></div>
          <div><label htmlFor="r-aux" className="etiqueta">Auxiliar</label>
            <select id="r-aux" className="campo" value={auxiliarId} onChange={(e) => setAuxiliarId(e.target.value)} data-testid="ruta-auxiliar">
              <option value="">Sin auxiliar</option>
              {panorama.personal.filter((p) => p.funcion === 'AUXILIAR' && (p.activo || p.id === auxiliarId)).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select></div>
        </div>
      </section>

      <section aria-labelledby="t-paradas" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="t-paradas" className="font-heading text-xl font-semibold uppercase tracking-wide text-gray-900">Paradas <span className="tabular text-gray-600" data-testid="conteo-paradas">({paradas.length})</span></h2>
          {paradas.length > 1 && <button type="button" className="btn-secondary btn-sm" onClick={sugerir} data-testid="ordenar-zona"><ListOrdered className="h-4 w-4" aria-hidden />Ordenar por zona</button>}
        </div>
        {paradas.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-300 bg-white px-4 py-8 text-center text-sm text-gray-700" data-testid="sin-paradas">Todavía no hay pedidos en la ruta. Agrégalos desde la lista de abajo.</p>
        ) : (
          <ol className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 bg-white" data-testid="lista-paradas">
            {paradas.map((pp, i) => {
              const p = pedido.get(pp.pedidoId)
              if (!p) return <li key={pp.pedidoId} className="px-4 py-3 text-sm text-red-800">Un pedido ya no está en la bandeja.</li>
              const guardada = ruta.paradas.find((x) => x.pedidoId === pp.pedidoId)
              const tarde = fueraDeCorte(p.importadoEn, fecha, panorama.corte)
              const alertas = [vehiculo && p.vehiculoCalificado && !vehiculo.calificado ? 'Exige vehículo calificado' : (!vehiculo && p.vehiculoCalificado ? 'Exige vehículo calificado' : '')].filter(Boolean)
              return (
                <li key={pp.pedidoId} className="space-y-2 px-3 py-3 md:px-4" data-testid="parada">
                  <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
                    <span className="tabular mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-50 text-sm font-semibold text-green-900" aria-label={`Parada ${i + 1}`}>{i + 1}</span>
                    <div className="min-w-0 flex-1 basis-48">
                      <p className="font-medium text-gray-900">{p.cliente} <span className="tabular text-sm font-normal text-gray-600">· {p.numero}</span></p>
                      <p className="text-sm text-gray-700">{[p.distrito, p.ventanaCita, `${p.unidades.toLocaleString('es-PE')} u`].filter(Boolean).join(' · ')}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        {guardada ? <ChipStockParada stock={guardada.stock} /> : <span className={`${base} border-gray-300 bg-gray-100 text-gray-800`}>Stock se asigna al guardar</span>}
                        {guardada?.salidaNumero && <span className="tabular text-xs text-gray-600">{guardada.salidaNumero}</span>}
                        {alertas.map((a) => <span key={a} className={`${base} ${CHIP_AVISO}`}><TriangleAlert className="h-3.5 w-3.5" aria-hidden />{a}</span>)}
                        {tarde && <span className={`${base} ${CHIP_AVISO}`} data-testid="chip-corte"><TriangleAlert className="h-3.5 w-3.5" aria-hidden />Llegó después del corte</span>}
                      </div>
                    </div>
                    <div className="ml-11 flex shrink-0 gap-1 sm:ml-0">
                      <button type="button" className={icono} onClick={() => mover(i, -1)} disabled={i === 0} aria-label={`Subir ${p.cliente}`} data-testid="parada-subir"><ArrowUp className="h-5 w-5" aria-hidden /></button>
                      <button type="button" className={icono} onClick={() => mover(i, 1)} disabled={i === paradas.length - 1} aria-label={`Bajar ${p.cliente}`} data-testid="parada-bajar"><ArrowDown className="h-5 w-5" aria-hidden /></button>
                      <button type="button" className={icono} onClick={() => quitar(i)} aria-label={`Quitar ${p.cliente} de la ruta`} data-testid="parada-quitar"><Trash2 className="h-5 w-5" aria-hidden /></button>
                    </div>
                  </div>
                  {tarde && (
                    <div className="ml-11 space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                      <label className="flex min-h-11 items-center gap-2"><input type="checkbox" className="h-5 w-5" checked={!!pp.excepcionCorte} onChange={(e) => marcar(i, { excepcionCorte: e.target.checked, motivoExcepcion: e.target.checked ? pp.motivoExcepcion : undefined })} data-testid="excepcion-corte" />Incluirlo con excepción (llegó después de las {panorama.corte} de la víspera)</label>
                      {pp.excepcionCorte && <div><label htmlFor={`mot-${pp.pedidoId}`} className="etiqueta">Motivo de la excepción</label><input id={`mot-${pp.pedidoId}`} className="campo" value={pp.motivoExcepcion ?? ''} onChange={(e) => marcar(i, { motivoExcepcion: e.target.value })} data-testid="excepcion-motivo" /></div>}
                    </div>
                  )}
                </li>
              )
            })}
          </ol>
        )}
      </section>

      {errores.length > 0 && <Aviso tipo="atencion" testid="errores-plan"><p className="font-medium">Antes de guardar:</p><ul className="mt-1 list-disc space-y-0.5 pl-5">{errores.map((e) => <li key={e}>{e}</li>)}</ul></Aviso>}
      {aviso && <Aviso tipo="atencion" testid="aviso-bloqueados">{aviso}</Aviso>}
      {mensaje && <Aviso tipo={mensaje.tipo === 'ok' ? 'ok' : 'error'} testid={mensaje.tipo === 'ok' ? 'ruta-ok' : 'ruta-error'}>{mensaje.texto}</Aviso>}

      {requiereMotivo && (
        <div><label htmlFor="r-motivo" className="etiqueta">¿Por qué cambia la ruta? <span className="font-normal text-gray-600">(queda en su historial)</span></label><input id="r-motivo" className="campo" value={motivo} onChange={(e) => setMotivo(e.target.value)} data-testid="ruta-motivo" /></div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn-primary" disabled={pendiente || errores.length > 0 || !sucio || (requiereMotivo && !motivo.trim())} onClick={guardar} data-testid="guardar-plan"><Save className="h-5 w-5" aria-hidden />{pendiente ? 'Guardando…' : 'Guardar plan'}</button>
        {ruta.estado === 'BORRADOR' && <button type="button" className="btn-secondary" disabled={pendiente || sucio || paradas.length === 0} onClick={confirmar} data-testid="confirmar-ruta"><CheckCircle2 className="h-5 w-5" aria-hidden />Confirmar ruta</button>}
        <button type="button" className="btn-secondary" onClick={() => setCancelando((c) => !c)} data-testid="abrir-cancelar"><Ban className="h-5 w-5" aria-hidden />Cancelar ruta</button>
        {sucio && <span className="text-sm text-amber-900" data-testid="cambios-sin-guardar">Hay cambios sin guardar.</span>}
      </div>
      {cancelando && (
        <section className="space-y-3 rounded-lg border border-red-200 bg-red-50 p-4" aria-label="Cancelar la ruta" data-testid="form-cancelar">
          <p className="text-sm text-red-950">Al cancelarla se liberan las salidas y los pedidos vuelven a la bandeja. Si ya hay picking, no se puede.</p>
          <div><label htmlFor="mot-cancelar" className="etiqueta">Motivo</label><input id="mot-cancelar" className="campo" value={motivoCancelar} onChange={(e) => setMotivoCancelar(e.target.value)} data-testid="cancelar-motivo" /></div>
          <button type="button" className="btn-secondary" disabled={pendiente || !motivoCancelar.trim()} onClick={cancelar} data-testid="cancelar-confirmar">Cancelar la ruta</button>
        </section>
      )}

      <section aria-labelledby="t-agregar" className="space-y-3">
        <h2 id="t-agregar" className="font-heading text-xl font-semibold uppercase tracking-wide text-gray-900">Pedidos por planificar</h2>
        <Buscador id="q-agregar" etiqueta="Buscar pedidos" ayuda="Por número, cliente, RUC o distrito." valor={q} onCambio={setQ} testid="agregar-buscar" />
        {disponibles.length === 0 ? <p className="rounded-lg border border-gray-200 bg-white px-4 py-6 text-center text-sm text-gray-700" data-testid="sin-disponibles">No hay más pedidos para agregar.</p> : (
          <ul className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 bg-white" data-testid="lista-disponibles">
            {disponibles.map((p) => {
              const bloqueo = motivoBloqueo(p)
              return (
                <li key={p.pedidoId} className="flex flex-wrap items-center gap-3 px-3 py-3 md:px-4" data-testid="pedido-disponible">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900">{p.cliente} <span className="tabular text-sm font-normal text-gray-600">· {p.numero}</span></p>
                    <p className="text-sm text-gray-700">{[p.distrito, p.ventanaCita, `${p.lineas} ${p.lineas === 1 ? 'línea' : 'líneas'}`, `${p.unidades.toLocaleString('es-PE')} u`].filter(Boolean).join(' · ')}</p>
                    {p.vehiculoCalificado && <p className="text-xs text-gray-600">Pide vehículo: {p.vehiculoCalificado}</p>}
                    {bloqueo && <p className={`${base} ${CHIP_AVISO} mt-1`}><TriangleAlert className="h-3.5 w-3.5" aria-hidden />{bloqueo}</p>}
                  </div>
                  <button type="button" className="btn-secondary" onClick={() => agregar(p)} disabled={!!bloqueo} aria-label={`Agregar ${p.numero} a la ruta`} data-testid="agregar-pedido"><Plus className="h-5 w-5" aria-hidden />Agregar</button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <PanelLsFr ruta={ruta} registro={registro} puedeCerrar={permisos.cerrar} puedeRegistrar={permisos.registrar} />

      <section aria-labelledby="t-hist" className="space-y-2">
        <h2 id="t-hist" className="flex items-center gap-2 font-heading text-xl font-semibold uppercase tracking-wide text-gray-900"><History className="h-5 w-5 text-gray-500" aria-hidden />Historial de versiones</h2>
        <ol className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white text-sm" data-testid="historial-ruta">
          {ruta.versiones.map((v) => <li key={v.version} className="flex flex-wrap gap-x-3 gap-y-1 px-4 py-2.5"><span className="font-medium text-gray-900">Versión {v.version}</span><span className="text-gray-700">{v.motivo} · {v.paradas} {v.paradas === 1 ? 'parada' : 'paradas'}</span><span className="text-gray-600">{v.por} · {formatoFechaHora(v.en)}</span></li>)}
        </ol>
      </section>
    </div>
  )
}
