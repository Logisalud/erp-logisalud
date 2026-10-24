'use client'

import { useState, type FormEvent } from 'react'
import { CheckCircle2, CircleSlash, Eye, FileText, Hourglass, PackageCheck, Paperclip } from 'lucide-react'
import {
  anularDictamenAccion, confirmarDictamenAccion, levantarObservacionAccion, observarActaAccion, registrarDictamenAccion,
} from '@/app/acciones-liberacion'
import {
  AYUDA_LIBERACION_CLIENTE, AYUDA_LIBERACION_LOGISSA, ETIQUETA_ESTADO_DICTAMEN, MAX_BYTES_DICTAMEN, observacionVigente, textoTrasRegistrarDictamen,
  type DictamenClienteVista, type EstadoDictamen,
} from '@/domain/liberacion'
import type { OrganolepticaVista } from '@/domain/entradas-vistas'
import { formatoFecha, formatoFechaHora } from '@/domain/fechas'
import { useAccion } from '../usar-accion'
import { Aviso } from '../entradas/aviso'

const ICONO: Record<EstadoDictamen, typeof Hourglass> = { REGISTRADO: Hourglass, CONFIRMADO: CheckCircle2, ANULADO: CircleSlash }
const CLASE: Record<EstadoDictamen, string> = {
  REGISTRADO: 'border-amber-300 bg-amber-50 text-amber-900', CONFIRMADO: 'border-green-200 bg-green-50 text-green-800', ANULADO: 'border-gray-300 bg-gray-100 text-gray-700',
}
/** El acta cambia de clave al firmarse y la pantalla se vuelve a montar: el aviso de éxito se recuerda para que no desaparezca. */
const recordado = new Map<string, string>()
const u = (n: number) => `${n.toLocaleString('es-PE')} ${n === 1 ? 'unidad' : 'unidades'}`

/**
 * Liberación del producto (LS-POE.04.05). En un producto de Logissa: la observación reversible de Dirección Técnica. En el de un cliente de almacenamiento: el dictamen
 * de su DT, que Sandra o Katia registran con el documento recibido y luego confirman. Después de cada acción dice qué pasó y qué sigue.
 */
export function PanelLiberacion({ acta, puedeObservar, puedeDictaminar, soyAsistente }: { acta: OrganolepticaVista; puedeObservar: boolean; puedeDictaminar: boolean; soyAsistente: boolean }) {
  const { pendiente, mensaje: mensajeAccion, ejecutar: ejecutarAccion, limpiar } = useAccion()
  const [previo] = useState(() => { const t = recordado.get(acta.id); recordado.delete(acta.id); return t })
  const mensaje = mensajeAccion ?? (previo ? { tipo: 'ok' as const, texto: previo, errores: undefined } : null)
  const ejecutar: typeof ejecutarAccion = (fn, o = {}) => { ejecutarAccion(fn, { ...o, alExito: (r) => { if (o.exito) recordado.set(acta.id, o.exito); o.alExito?.(r) } }) }
  const [modo, setModo] = useState<null | 'observar' | 'levantar' | { anular: string }>(null)
  const [texto, setTexto] = useState('')
  const errores: Record<string, string> = mensaje?.tipo === 'error' ? mensaje.errores ?? {} : {}
  const esCliente = !!acta.esDeCliente
  const abierta = acta.estado === 'PENDIENTE_DT'
  const firmada = acta.estado === 'FIRMADA'
  const vigente = (acta.observaciones ?? []).find(observacionVigente)
  const dictamenes = acta.dictamenes ?? []
  const porConfirmar = dictamenes.find((d) => d.estado === 'REGISTRADO')
  const esperando = acta.pendienteDecision ?? 0
  const puedeRegistrar = esCliente && puedeDictaminar && abierta && !porConfirmar && esperando > 0
  const cerrar = () => { setModo(null); setTexto('') }
  const hayHistoria = (acta.observaciones ?? []).length > 0 || dictamenes.length > 0
  if (!esCliente && !vigente && !(puedeObservar && abierta) && !hayHistoria) return null

  function registrar(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault()
    const f = new FormData(ev.currentTarget)
    f.set('actaId', acta.id)
    ejecutar(() => registrarDictamenAccion(f), {
      exito: textoTrasRegistrarDictamen(soyAsistente ? 'asistente_dt' : 'direccion_tecnica'),
      alExito: () => { (ev.target as HTMLFormElement | null)?.reset?.() },
    })
  }

  return (
    <section className="card space-y-4" aria-labelledby="titulo-liberacion" data-testid="panel-liberacion">
      <div>
        <h2 id="titulo-liberacion" className="flex items-center gap-2 font-heading text-lg font-medium uppercase tracking-wide text-gray-800"><PackageCheck className="h-5 w-5 text-logisalud-teal" aria-hidden />Liberación del producto</h2>
        <p className="mt-1 text-sm text-gray-700" data-testid="ayuda-liberacion">{esCliente ? AYUDA_LIBERACION_CLIENTE : AYUDA_LIBERACION_LOGISSA}</p>
        <p className="mt-1 text-xs text-gray-600">Procedimiento LS-POE.04.05. Este registro reemplaza el LS-FR.04 Control de Status: cada cambio de estado queda con su sustento, quién lo hizo y cuándo.</p>
      </div>

      {/* Observación reversible */}
      {vigente && (
        <Aviso tipo="atencion" testid="observacion-vigente">
          <p className="font-medium">Observada desde el {formatoFechaHora(vigente.registradaEn)}, por {vigente.registradaPor}.</p>
          <p className="mt-0.5">«{vigente.texto}»</p>
          <p className="mt-0.5">El producto sigue en <strong>Cuarentena</strong> hasta la disposición final.</p>
        </Aviso>
      )}
      {abierta && puedeObservar && modo === null && (
        <div className="flex flex-wrap gap-2">
          {vigente
            ? <button type="button" className="btn-secondary" onClick={() => { limpiar(); setModo('levantar') }} data-testid="levantar-observacion"><Eye className="h-5 w-5" aria-hidden />Levantar la observación</button>
            : <button type="button" className="btn-secondary" onClick={() => { limpiar(); setModo('observar') }} data-testid="observar-acta"><Eye className="h-5 w-5" aria-hidden />Dejar el acta observada</button>}
        </div>
      )}
      {(modo === 'observar' || modo === 'levantar') && (
        <div className="space-y-2" data-testid={modo === 'observar' ? 'form-observar' : 'form-levantar'}>
          <label htmlFor="texto-obs" className="etiqueta">{modo === 'observar' ? '¿Qué se observa y qué hay que corregir?' : '¿Cómo se resolvió la observación?'}</label>
          <textarea id="texto-obs" rows={3} className="campo py-2" value={texto} onChange={(e) => setTexto(e.target.value)} data-testid="texto-observacion" />
          {modo === 'observar' && <p className="text-sm text-gray-700">Es reversible: el producto sigue en Cuarentena y no cambia de estado hasta que se apruebe o se rechace.</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary btn-sm" disabled={pendiente || !texto.trim()} data-testid="confirmar-observacion"
              onClick={() => ejecutar(() => (modo === 'observar' ? observarActaAccion(acta.id, texto) : levantarObservacionAccion(acta.id, texto)),
                { exito: modo === 'observar' ? 'Acta observada. Siguiente: el producto sigue en Cuarentena; cuando se corrija, levanta la observación o decide Aprobado o Bajas.' : 'Observación levantada. Siguiente: ya se puede decidir Aprobado o Bajas/Rechazados.', alExito: cerrar })}>
              {modo === 'observar' ? 'Dejar observada' : 'Levantar la observación'}
            </button>
            <button type="button" className="btn-secondary btn-sm" onClick={cerrar}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Dictamen del DT del cliente */}
      {esCliente && (
        <div className="space-y-3 border-t border-gray-200 pt-4" data-testid="dictamen-cliente">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-800">Dictamen del DT del cliente</h3>
          {!firmada && <p className="text-sm text-gray-800" data-testid="esperando-decision">Esperan decisión <strong className="tabular">{u(esperando)}</strong> de las {acta.cantidadLote.toLocaleString('es-PE')} de este lote.</p>}
          {acta.estado === 'BORRADOR' && <Aviso tipo="info">Primero se termina la evaluación organoléptica y se envía a Dirección Técnica. Después registras aquí el dictamen del DT del cliente.</Aviso>}
          {dictamenes.length === 0 && acta.estado !== 'BORRADOR' && !firmada && <p className="text-sm text-gray-600">Todavía no hay un dictamen registrado. Cuando llegue el documento del DT del cliente por correo, adjúntalo aquí.</p>}

          <ul className="space-y-2" data-testid="lista-dictamenes">
            {dictamenes.map((d) => <FilaDictamen key={d.id} d={d} actaId={acta.id} puede={puedeDictaminar && abierta} pendiente={pendiente}
              onConfirmar={() => ejecutar(() => confirmarDictamenAccion(d.id), { exito: `Cambio de estado confirmado: ${u(d.liberada)} pasaron a Aprobado y ${u(d.rechazada)} a Bajas/Rechazados.${esperando - d.liberada - d.rechazada === 0 ? ' El acta quedó firmada: el lote ya tiene su decisión.' : ' El resto del lote sigue esperando otro dictamen.'}` })}
              anulando={typeof modo === 'object' && modo !== null && modo.anular === d.id} abrirAnular={() => { limpiar(); setTexto(''); setModo({ anular: d.id }) }} cerrar={cerrar}
              texto={texto} setTexto={setTexto}
              onAnular={() => ejecutar(() => anularDictamenAccion(d.id, texto), { exito: 'Dictamen anulado. Siguiente: registra el dictamen correcto cuando lo tengas.', alExito: cerrar })} />)}
          </ul>

          {puedeRegistrar && (
            <form onSubmit={registrar} className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3" data-testid="form-dictamen" encType="multipart/form-data">
              <h4 className="text-sm font-semibold text-gray-900">Registrar el dictamen que llegó por correo</h4>
              <div className="grid gap-3 sm:grid-cols-3">
                <div><label htmlFor="d-liberada" className="etiqueta">Unidades liberadas</label><input id="d-liberada" name="liberada" inputMode="numeric" className="campo tabular" defaultValue="" autoComplete="off" data-testid="dictamen-liberada" aria-invalid={errores.liberada ? true : undefined} />{errores.liberada && <p className="mt-1 text-sm text-red-800">{errores.liberada}</p>}</div>
                <div><label htmlFor="d-rechazada" className="etiqueta">Unidades rechazadas</label><input id="d-rechazada" name="rechazada" inputMode="numeric" className="campo tabular" defaultValue="" autoComplete="off" data-testid="dictamen-rechazada" aria-invalid={errores.rechazada ? true : undefined} />{errores.rechazada && <p className="mt-1 text-sm text-red-800">{errores.rechazada}</p>}</div>
                <div><label htmlFor="d-fecha" className="etiqueta">Fecha del dictamen</label><input id="d-fecha" name="fechaDictamen" type="date" className="campo tabular" data-testid="dictamen-fecha" aria-invalid={errores.fechaDictamen ? true : undefined} />{errores.fechaDictamen && <p className="mt-1 text-sm text-red-800">{errores.fechaDictamen}</p>}</div>
              </div>
              <div>
                <label htmlFor="d-doc" className="etiqueta">Documento del dictamen (PDF o imagen, hasta {MAX_BYTES_DICTAMEN / 1024 / 1024} MB)</label>
                <input id="d-doc" name="documento" type="file" accept="application/pdf,image/png,image/jpeg" className="campo py-2.5" data-testid="dictamen-documento" aria-invalid={errores.documento ? true : undefined} />
                {errores.documento && <p className="mt-1 text-sm text-red-800">{errores.documento}</p>}
              </div>
              <div><label htmlFor="d-obs" className="etiqueta">Observación (opcional)</label><input id="d-obs" name="observacion" className="campo" autoComplete="off" data-testid="dictamen-observacion" /></div>
              <p className="text-sm text-gray-700">Registrar no cambia el estado todavía: en el paso siguiente confirmas el cambio tú misma o tú mismo, sin segunda firma.</p>
              <button type="submit" className="btn-primary" disabled={pendiente} data-testid="registrar-dictamen">{pendiente ? 'Registrando…' : 'Registrar el dictamen'}</button>
            </form>
          )}
        </div>
      )}

      {mensaje && <Aviso tipo={mensaje.tipo === 'ok' ? 'ok' : 'error'}>{mensaje.texto}{mensaje.errores && mensaje.tipo === 'error' && Object.values(mensaje.errores).length > 1 ? ` (${Object.values(mensaje.errores).length} campos por revisar)` : ''}</Aviso>}

      {(acta.observaciones ?? []).length > 0 && (
        <details className="text-sm text-gray-700">
          <summary className="cursor-pointer font-medium">Historia de observaciones ({acta.observaciones!.length})</summary>
          <ul className="mt-1 space-y-1" data-testid="historia-observaciones">
            {acta.observaciones!.map((o) => <li key={o.id}>{formatoFechaHora(o.registradaEn)} · {o.registradaPor}: «{o.texto}»{o.cerradaEn ? ` — cerrada ${formatoFechaHora(o.cerradaEn)}${o.nota ? `: ${o.nota}` : ''}` : ' — vigente'}</li>)}
          </ul>
        </details>
      )}
    </section>
  )
}

function FilaDictamen({ d, actaId, puede, pendiente, onConfirmar, anulando, abrirAnular, cerrar, texto, setTexto, onAnular }: {
  d: DictamenClienteVista; actaId: string; puede: boolean; pendiente: boolean; onConfirmar: () => void; anulando: boolean; abrirAnular: () => void; cerrar: () => void
  texto: string; setTexto: (t: string) => void; onAnular: () => void
}) {
  const Icono = ICONO[d.estado]
  const prefijo = process.env.NEXT_PUBLIC_BASE_PATH ?? ''
  return (
    <li className="rounded-lg border border-gray-200 bg-white p-3" data-testid="dictamen-fila">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${CLASE[d.estado]}`}><Icono className="h-3.5 w-3.5" aria-hidden />{ETIQUETA_ESTADO_DICTAMEN[d.estado]}</span>
        <span className="tabular text-sm text-gray-900"><strong>{d.liberada.toLocaleString('es-PE')}</strong> liberadas · <strong>{d.rechazada.toLocaleString('es-PE')}</strong> rechazadas</span>
      </div>
      <p className="mt-1 text-sm text-gray-700">
        {d.fechaDictamen ? `Dictamen del ${formatoFecha(d.fechaDictamen)} · ` : ''}registrado por {d.registradoPor} el {formatoFechaHora(d.registradoEn)}
        {d.confirmadoEn ? ` · confirmado por ${d.confirmadoPor} el ${formatoFechaHora(d.confirmadoEn)}` : ''}
        {d.anuladoEn ? ` · anulado por ${d.anuladoPor}: «${d.motivoAnulacion}»` : ''}
      </p>
      {d.observacion && <p className="text-sm text-gray-700">Observación: {d.observacion}</p>}
      {d.documentoRef && <p className="mt-1 text-sm"><a className="inline-flex min-h-10 items-center gap-1.5 text-gray-900 underline underline-offset-2" href={`${prefijo}/calidad/${actaId}/dictamen/${d.id}`} target="_blank" rel="noopener" data-testid="dictamen-documento-enlace"><Paperclip className="h-4 w-4" aria-hidden /><FileText className="h-4 w-4" aria-hidden />{d.documentoNombre ?? 'Documento del dictamen'}</a></p>}
      {d.estado === 'REGISTRADO' && puede && !anulando && (
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" className="btn-primary btn-sm" disabled={pendiente} onClick={onConfirmar} data-testid="confirmar-dictamen">Confirmar el cambio de estado</button>
          <button type="button" className="btn-secondary btn-sm" disabled={pendiente} onClick={abrirAnular} data-testid="anular-dictamen">Anular</button>
        </div>
      )}
      {anulando && (
        <div className="mt-2 space-y-2" data-testid="form-anular-dictamen">
          <label htmlFor={`m-${d.id}`} className="etiqueta">¿Por qué se anula el dictamen?</label>
          <input id={`m-${d.id}`} className="campo" value={texto} onChange={(e) => setTexto(e.target.value)} data-testid="motivo-anular-dictamen" autoComplete="off" />
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary btn-sm" disabled={pendiente || !texto.trim()} onClick={onAnular} data-testid="confirmar-anular-dictamen">Anular el dictamen</button>
            <button type="button" className="btn-secondary btn-sm" onClick={cerrar}>Cancelar</button>
          </div>
        </div>
      )}
    </li>
  )
}
