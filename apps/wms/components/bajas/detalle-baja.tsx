'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, Ban, CheckCircle2, CircleAlert, Download, FileCheck2, FileText, Paperclip, PenLine, Printer, RefreshCw, Stamp, Truck, Undo2, XCircle } from 'lucide-react'
import {
  adjuntarSustentoBajaAccion, anularOrdenBajaAccion, autorizarBajaAccion, cerrarSolicitudBajaAccion, confirmarVencimientoBajaAccion, reemitirOrdenBajaAccion, trasladarBajaAccion,
} from '@/app/acciones-bajas'
import {
  ETIQUETA_ESTADO_BAJABLE, ETIQUETA_SUSTENTO, MENSAJE_BAJA, TIPO_SUSTENTO_DE_MOTIVO, fechaCorta, primerFaltante, puedeAutorizarBaja, puedeEvaluarBaja, puedeSolicitarBaja, puedeTrasladarBaja,
  resumenSustento, siguientePasoBaja, type LineaBajaVista, type OrdenBajaVista,
} from '@/domain/bajas'
import { formatoFechaHora } from '@/domain/fechas'
import type { Rol } from '@/domain/tipos'
import { Aviso } from '../entradas/aviso'
import { useAccion } from '../usar-accion'
import { ChipEstadoBaja, ChipMotivoBaja } from './chips-baja'
import { FormEvaluacionBaja } from './form-evaluacion-baja'

const tam = (b?: number) => (b == null ? '' : b >= 1_048_576 ? `${(b / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`)

function Adjuntar({ linea, onListo }: { linea: LineaBajaVista; onListo: (t: string) => void }) {
  const { pendiente, mensaje, ejecutar } = useAccion()
  const [archivo, setArchivo] = useState<File | null>(null)
  const [referencia, setReferencia] = useState('')
  const tipo = TIPO_SUSTENTO_DE_MOTIVO[linea.motivo]!
  const errores = mensaje?.errores ?? {}
  function enviar() {
    if (!archivo) return
    const f = new FormData()
    f.set('lineaId', linea.id); f.set('tipo', tipo); f.set('archivo', archivo); f.set('referencia', referencia)
    ejecutar(() => adjuntarSustentoBajaAccion(f), { exito: MENSAJE_BAJA.sustentoAdjuntado, alExito: () => { setArchivo(null); setReferencia(''); onListo(MENSAJE_BAJA.sustentoAdjuntado) } })
  }
  return (
    <div className="mt-3 space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3.5" data-testid="form-adjuntar-baja">
      <div>
        <label htmlFor={`arch-${linea.id}`} className="etiqueta">{ETIQUETA_SUSTENTO[tipo]} (PDF o imagen, hasta 10 MB)</label>
        <input id={`arch-${linea.id}`} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/*" className="campo py-2.5" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} aria-invalid={!!errores.archivo} data-testid="archivo-sustento" />
        {errores.archivo && <p className="mt-1 text-sm text-red-800" role="alert">{errores.archivo}</p>}
      </div>
      <div>
        <label htmlFor={`ref-${linea.id}`} className="etiqueta">N.° de la alerta, carta o correo (opcional)</label>
        <input id={`ref-${linea.id}`} className="campo" value={referencia} onChange={(e) => setReferencia(e.target.value)} autoComplete="off" maxLength={80} />
      </div>
      {mensaje?.tipo === 'error' && !errores.archivo && <Aviso tipo="error">{mensaje.texto}</Aviso>}
      <button type="button" className="btn-secondary btn-sm" disabled={pendiente || !archivo} onClick={enviar} data-testid="adjuntar-sustento"><Paperclip className="h-4 w-4" aria-hidden />{pendiente ? 'Adjuntando…' : 'Adjuntar el archivo'}</button>
    </div>
  )
}

function LineaCard({ orden, l, roles, avisar }: { orden: OrdenBajaVista; l: LineaBajaVista; roles: readonly Rol[]; avisar: (t: string) => void }) {
  const { pendiente, mensaje, ejecutar } = useAccion()
  const [panel, setPanel] = useState<'evaluar' | 'adjuntar' | null>(null)
  const abierta = orden.estado === 'SOLICITADA'
  const sus = resumenSustento(l)
  const esDT = puedeAutorizarBaja(roles)
  return (
    <li className="rounded-lg border border-gray-200 bg-white p-4" data-testid="linea-orden-baja">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-gray-600">Línea {l.n}</p>
          <p className="font-medium text-gray-900">{l.producto}</p>
          <p className="text-sm text-gray-700">{[l.presentacion, l.registroSanitario ? `R.S. ${l.registroSanitario}` : 'Sin registro sanitario'].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="text-right"><p className="tabular font-heading text-xl font-semibold text-gray-900">{l.cantidad.toLocaleString('es-PE')} <span className="text-sm font-normal text-gray-600">und.</span></p><ChipMotivoBaja motivo={l.motivo} /></div>
      </div>
      <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
        <div><dt className="text-gray-600">Lote</dt><dd className="text-gray-900">{l.lote}</dd></div>
        <div><dt className="text-gray-600">Vence</dt><dd className="text-gray-900">{l.vence ? fechaCorta(l.vence) : 'Sin vencimiento'}</dd></div>
        <div><dt className="text-gray-600">Está en</dt><dd className="text-gray-900">{l.posicion} · {ETIQUETA_ESTADO_BAJABLE[l.estadoOrigen]}</dd></div>
      </dl>
      {l.detalle && <p className="mt-2 text-sm text-gray-700">Detalle: {l.detalle}</p>}

      <div className={`mt-3 flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${sus.completo ? 'border-green-200 bg-green-50 text-green-900' : 'border-amber-300 bg-amber-50 text-amber-950'}`} data-testid="sustento-linea">
        {sus.completo ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> : <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
        <div className="min-w-0">
          <p className="font-medium">{sus.completo ? 'Sustento completo' : 'Falta el sustento'}</p>
          {!sus.completo && <p>{sus.texto}</p>}
          {l.motivo === 'VENCIDO' && l.venceConfirmada && <p>Vencimiento {fechaCorta(l.venceConfirmada)} confirmado por {l.venceConfirmadaPor ?? 'Dirección Técnica'}.</p>}
          {l.motivo === 'DETERIORO_DANO' && l.evaluacion && <p>Evaluación versión {l.evaluacion.version}: {l.evaluacion.conclusion === 'NO_CONFORME' ? 'no conforme' : 'conforme'}, por {l.evaluacion.evaluadaPor} el {formatoFechaHora(l.evaluacion.evaluadaEn)}. «{l.evaluacion.observacion}»</p>}
        </div>
      </div>

      {l.sustentos.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm" aria-label="Archivos adjuntos">
          {l.sustentos.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center gap-2"><FileText className="h-4 w-4 text-gray-500" aria-hidden />
              <Link href={`/bajas/${orden.id}/sustento/${x.id}`} target="_blank" className="underline" data-testid="ver-sustento">{x.nombreArchivo}</Link>
              <span className="text-xs text-gray-600">{ETIQUETA_SUSTENTO[x.tipo]}{x.referencia ? ` · ${x.referencia}` : ''}{x.bytes ? ` · ${tam(x.bytes)}` : ''} · {x.agregadoPor}</span>
            </li>
          ))}
        </ul>
      )}

      {abierta && (
        <div className="mt-3 flex flex-wrap gap-2">
          {l.motivo === 'VENCIDO' && esDT && (!l.venceConfirmada || l.venceConfirmada !== l.vence) && (
            <button type="button" className="btn-secondary btn-sm" disabled={pendiente} data-testid="confirmar-vencimiento"
              onClick={() => ejecutar(() => confirmarVencimientoBajaAccion(l.id), { exito: MENSAJE_BAJA.vencimientoConfirmado, alExito: () => avisar(MENSAJE_BAJA.vencimientoConfirmado) })}>
              <Stamp className="h-4 w-4" aria-hidden />{pendiente ? 'Confirmando…' : `Confirmar que venció el ${l.vence ? fechaCorta(l.vence) : ''}`}
            </button>
          )}
          {l.motivo === 'VENCIDO' && !esDT && !l.venceConfirmada && <p className="text-sm text-gray-700">Dirección Técnica confirma la fecha de vencimiento.</p>}
          {l.motivo === 'DETERIORO_DANO' && puedeEvaluarBaja(roles) && (
            <button type="button" className="btn-secondary btn-sm" onClick={() => setPanel(panel === 'evaluar' ? null : 'evaluar')} aria-expanded={panel === 'evaluar'} data-testid="abrir-evaluacion"><PenLine className="h-4 w-4" aria-hidden />{l.evaluacion ? 'Registrar otra evaluación' : 'Registrar la evaluación'}</button>
          )}
          {l.motivo === 'DETERIORO_DANO' && !puedeEvaluarBaja(roles) && !l.evaluacion && <p className="text-sm text-gray-700">La evaluación la registra la asistente de Dirección Técnica o Dirección Técnica.</p>}
          {(l.motivo === 'ALERTA_DIGEMID' || l.motivo === 'OBSERVACION_PROVEEDOR') && puedeSolicitarBaja(roles) && (
            <button type="button" className="btn-secondary btn-sm" onClick={() => setPanel(panel === 'adjuntar' ? null : 'adjuntar')} aria-expanded={panel === 'adjuntar'} data-testid="abrir-adjuntar"><Paperclip className="h-4 w-4" aria-hidden />{l.sustentos.length ? 'Adjuntar otro archivo' : 'Adjuntar el archivo'}</button>
          )}
        </div>
      )}
      {panel === 'evaluar' && <FormEvaluacionBaja lineaId={l.id} previa={l.evaluacion} onTerminar={(t) => { setPanel(null); if (t) avisar(t) }} />}
      {panel === 'adjuntar' && <Adjuntar linea={l} onListo={(t) => { setPanel(null); avisar(t) }} />}
      {mensaje?.tipo === 'error' && <div className="mt-3"><Aviso tipo="error">{mensaje.texto}</Aviso></div>}
    </li>
  )
}

/** Un motivo escrito (rechazar, retirar, anular): obligatorio, y se explica qué pasa después. */
function AccionConMotivo({ id, etiqueta, ayuda, boton, icono, confirmar, exito, testid, onListo, tono = 'neutro' }: {
  onListo: (texto: string) => void; id: string; etiqueta: string; ayuda: string; boton: string; icono: React.ReactNode; confirmar: (motivo: string) => ReturnType<typeof cerrarSolicitudBajaAccion>; exito: string; testid: string; tono?: 'neutro' | 'peligro'
}) {
  const { pendiente, mensaje, ejecutar } = useAccion()
  const [abierto, setAbierto] = useState(false)
  const [motivo, setMotivo] = useState('')
  if (!abierto) return <button type="button" className="btn-secondary" onClick={() => setAbierto(true)} data-testid={`${testid}-abrir`}>{icono}{boton}</button>
  return (
    <div className="w-full space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3.5" data-testid={`${testid}-panel`}>
      <label htmlFor={id} className="etiqueta">{etiqueta}</label>
      <textarea id={id} rows={2} className="campo py-2" value={motivo} onChange={(e) => setMotivo(e.target.value)} aria-invalid={!!mensaje?.errores?.motivo} data-testid={`${testid}-motivo`} />
      <p className="text-sm text-gray-700">{ayuda}</p>
      {mensaje?.tipo === 'error' && <Aviso tipo="error">{mensaje.texto}</Aviso>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={tono === 'peligro' ? 'btn-secondary' : 'btn-primary'} disabled={pendiente || !motivo.trim()} onClick={() => ejecutar(() => confirmar(motivo), { alExito: () => onListo(exito) })} data-testid={`${testid}-confirmar`}>{icono}{pendiente ? 'Guardando…' : boton}</button>
        <button type="button" className="btn-secondary" disabled={pendiente} onClick={() => setAbierto(false)}>Cancelar</button>
      </div>
    </div>
  )
}

export function DetalleBaja({ orden, roles, usuarioId, ubicaciones, avisoInicial }: { orden: OrdenBajaVista; roles: readonly Rol[]; usuarioId: string; ubicaciones: { id: string; codigo: string }[]; avisoInicial?: string }) {
  const router = useRouter()
  const { pendiente, mensaje, ejecutar } = useAccion()
  const [aviso, setAviso] = useState<string | null>(avisoInicial ?? null)
  const [destino, setDestino] = useState('')
  const paso = siguientePasoBaja(orden)
  const esDT = puedeAutorizarBaja(roles)
  const faltante = primerFaltante(orden)
  const porTrasladar = orden.estado === 'EMITIDA' && !orden.traslado
  const puedeRetirar = orden.estado === 'SOLICITADA' && (esDT || orden.solicitadaPorId === usuarioId)

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-gray-600">Orden de Baja LS-FR.56.01</p>
          <h1 className="tabular font-heading text-3xl font-semibold uppercase tracking-wide text-gray-900" data-testid="numero-baja">{orden.numero}</h1>
          <p className="mt-1 text-gray-700">{orden.propietarioCodigo} · {orden.propietario}</p>
          <p className="text-sm text-gray-600">Pidió {orden.solicitadaPor} el {formatoFechaHora(orden.solicitadaEn)} · {orden.unidades.toLocaleString('es-PE')} und. en {orden.lineas.length} {orden.lineas.length === 1 ? 'línea' : 'líneas'}</p>
        </div>
        <div className="flex flex-col items-end gap-2"><ChipEstadoBaja estado={orden.estado} porTrasladar={porTrasladar} />
          <a className="btn-secondary btn-sm" href={`/bajas/${orden.id}/pdf`} target="_blank" rel="noopener" data-testid="pdf-orden-baja"><Printer className="h-4 w-4" aria-hidden />{orden.estado === 'EMITIDA' ? 'Ver o imprimir la Orden (PDF)' : orden.estado === 'ANULADA' ? 'Ver la Orden anulada (PDF)' : 'Ver el borrador (PDF)'}</a>
        </div>
      </header>

      {aviso && <Aviso tipo="ok" testid="aviso-baja-ok">{aviso}</Aviso>}
      {mensaje?.tipo === 'error' && <Aviso tipo="error" testid="aviso-baja-error">{mensaje.texto}</Aviso>}

      {paso.tono !== 'cerrada' && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-teal-950" data-testid="siguiente-paso-baja">
          <ArrowRight className="h-5 w-5 shrink-0" aria-hidden /><p><strong>Siguiente:</strong> {paso.texto}. <span className="text-teal-900">Le toca a: {paso.quien}.</span></p>
        </div>
      )}
      {orden.nota && <p className="rounded-md bg-gray-50 p-3 text-sm text-gray-800"><strong>Nota de quien pidió:</strong> {orden.nota}</p>}
      {orden.estado === 'RECHAZADA' && <Aviso tipo="error"><strong>Rechazada</strong> por {orden.cerradaPor} el {formatoFechaHora(orden.cerradaEn)}. Motivo: {orden.motivoCierre}</Aviso>}
      {orden.estado === 'CANCELADA' && <Aviso tipo="info"><strong>Solicitud retirada</strong> por {orden.cerradaPor} el {formatoFechaHora(orden.cerradaEn)}. Motivo: {orden.motivoCierre}</Aviso>}
      {orden.estado === 'ANULADA' && (
        <Aviso tipo="error"><strong>Orden anulada</strong> por {orden.anuladaPor} el {formatoFechaHora(orden.anuladaEn)}. Motivo: {orden.motivoAnulacion}. El documento ya no vale; el stock sigue en Bajas.
          {orden.reemitidaPor && <> Se reemitió como <Link href={`/bajas/${orden.reemitidaPor.id}`} className="underline">{orden.reemitidaPor.numero}</Link>.</>}</Aviso>
      )}
      {orden.reemiteDe && <p className="text-sm text-gray-700">Reemite la Orden <Link href={`/bajas/${orden.reemiteDe.id}`} className="underline">{orden.reemiteDe.numero}</Link>.</p>}
      {orden.estado === 'EMITIDA' && (
        <p className="flex flex-wrap items-center gap-1.5 text-sm text-gray-700"><FileCheck2 className="h-4 w-4 text-green-700" aria-hidden />Emitida por {orden.emitidaPor} el {formatoFechaHora(orden.emitidaEn)} · fecha del documento {orden.fechaDocumento ? fechaCorta(orden.fechaDocumento) : '—'} · huella <code className="tabular">{orden.hash?.slice(0, 12)}…</code>. No se edita: solo se anula con motivo y se reemite.</p>
      )}

      <section aria-labelledby="lineas-baja">
        <h2 id="lineas-baja" className="mb-3 font-heading text-lg font-medium uppercase tracking-wide text-gray-800">Lo que se da de baja</h2>
        <ul className="space-y-3" data-testid="lineas-orden-baja">{orden.lineas.map((l) => <LineaCard key={l.id} orden={orden} l={l} roles={roles} avisar={(t) => setAviso(t)} />)}</ul>
      </section>

      {orden.estado === 'SOLICITADA' && (
        <section className="card space-y-3" aria-labelledby="decidir-baja" data-testid="panel-decidir-baja">
          <h2 id="decidir-baja" className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">{esDT ? 'Tu decisión' : 'Qué sigue'}</h2>
          {esDT ? (
            <>
              <p className="text-sm text-gray-700">Al autorizar, el stock pasa a Bajas/Rechazados en su mismo lugar, el WMS emite la Orden de Baja y queda por trasladar al área de Bajas. Ese cambio no se revierte.</p>
              {faltante && <Aviso tipo="atencion" testid="falta-sustento-baja"><strong>Todavía no se puede autorizar.</strong> {faltante.replace('Sin sustento no se da de baja. ', '')}</Aviso>}
            </>
          ) : <p className="text-sm text-gray-700">Reúne el sustento de cada línea. Cuando esté completo, Dirección Técnica (Katia) la revisa y autoriza.</p>}
          <div className="flex flex-wrap gap-3">
            {esDT && <button type="button" className="btn-primary" disabled={pendiente || !!faltante} data-testid="autorizar-baja"
              onClick={() => { setAviso(null); ejecutar(() => autorizarBajaAccion(orden.id), { alExito: () => setAviso(MENSAJE_BAJA.autorizada(orden.numero)) }) }}><Stamp className="h-5 w-5" aria-hidden />{pendiente ? 'Autorizando…' : 'Autorizar y emitir la Orden'}</button>}
            {esDT && <AccionConMotivo onListo={(t) => setAviso(t)} id="motivo-rechazo" testid="rechazar-baja" boton="Rechazar la baja" etiqueta="Motivo del rechazo" ayuda="Quien pidió la baja verá tu motivo y podrá hacer otra solicitud." icono={<XCircle className="h-5 w-5" aria-hidden />} confirmar={(m) => cerrarSolicitudBajaAccion(orden.id, 'RECHAZADA', m)} exito={MENSAJE_BAJA.rechazada} />}
            {puedeRetirar && <AccionConMotivo onListo={(t) => setAviso(t)} id="motivo-retiro" testid="retirar-baja" boton="Retirar la solicitud" etiqueta="¿Por qué la retiras?" ayuda="La solicitud se cierra y las unidades quedan libres. Si hace falta, haces otra." icono={<Undo2 className="h-5 w-5" aria-hidden />} confirmar={(m) => cerrarSolicitudBajaAccion(orden.id, 'CANCELADA', m)} exito={MENSAJE_BAJA.retirada} />}
          </div>
        </section>
      )}

      {orden.estado === 'EMITIDA' && (
        <section className="card space-y-3" aria-labelledby="traslado-baja" data-testid="panel-traslado-baja">
          <h2 id="traslado-baja" className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">Traslado al área de Bajas</h2>
          {orden.traslado ? (
            <p className="flex flex-wrap items-center gap-2 text-sm text-gray-800"><Truck className="h-5 w-5 text-green-700" aria-hidden />Traslado registrado: <Link href={`/movimientos/${orden.traslado.ordenMovimientoId}`} className="underline" data-testid="ver-traslado">{orden.traslado.numero}</Link> ({orden.traslado.estado.toLowerCase().replace('_', ' ')}){orden.traslado.destino ? ` hacia ${orden.traslado.destino}` : ''}. Otra persona del almacén lo verifica en Movimientos.</p>
          ) : puedeTrasladarBaja(roles) ? (
            <>
              <p className="text-sm text-gray-700">El stock ya está en estado Bajas/Rechazados, pero físicamente sigue donde estaba. Llévalo al área de Bajas y regístralo aquí; otra persona lo verifica.</p>
              {ubicaciones.length === 0
                ? <Aviso tipo="atencion" testid="sin-ubicacion-bajas">Este propietario todavía no tiene una ubicación en el área de Bajas. Dirección Técnica y el Jefe de Almacén deben definirla antes de trasladar.</Aviso>
                : (
                  <div className="max-w-md">
                    <label htmlFor="destino-baja" className="etiqueta">Ubicación de destino</label>
                    <select id="destino-baja" className="campo" value={destino} onChange={(e) => setDestino(e.target.value)} data-testid="destino-baja">
                      <option value="">Elegir sola (donde ya tenga stock de Bajas)</option>
                      {ubicaciones.map((u) => <option key={u.id} value={u.id}>{u.codigo}</option>)}
                    </select>
                  </div>
                )}
              <button type="button" className="btn-primary" disabled={pendiente || ubicaciones.length === 0} data-testid="trasladar-baja"
                onClick={() => { setAviso(null); ejecutar(() => trasladarBajaAccion(orden.id, destino || undefined), { alExito: (r) => setAviso(MENSAJE_BAJA.trasladada(r.movimiento)) }) }}><Truck className="h-5 w-5" aria-hidden />{pendiente ? 'Registrando…' : 'Registrar el traslado a Bajas'}</button>
            </>
          ) : <p className="text-sm text-gray-700">El traslado lo registra el Jefe de Almacén o el auxiliar, y otra persona lo verifica.</p>}
        </section>
      )}

      {orden.estado === 'EMITIDA' && esDT && (
        <section className="card space-y-3" aria-labelledby="anular-baja">
          <h2 id="anular-baja" className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">Si el documento tiene un error</h2>
          <p className="text-sm text-gray-700">Anular deja sin efecto el documento, no el cambio de estado: el stock sigue en Bajas. Después puedes reemitir la Orden con otro número. Si las unidades se dieron de baja por error, se corrigen con un ajuste.</p>
          <div><AccionConMotivo onListo={(t) => setAviso(t)} id="motivo-anulacion" testid="anular-orden" boton="Anular la Orden" etiqueta="Motivo de la anulación" ayuda="Queda en el historial con tu nombre." icono={<Ban className="h-5 w-5" aria-hidden />} tono="peligro" confirmar={(m) => anularOrdenBajaAccion(orden.id, m)} exito={MENSAJE_BAJA.anulada} /></div>
        </section>
      )}

      {orden.estado === 'ANULADA' && esDT && !orden.reemitidaPor && (
        <section className="card space-y-3" aria-labelledby="reemitir-baja">
          <h2 id="reemitir-baja" className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">Reemitir</h2>
          <p className="text-sm text-gray-700">Se emite una Orden nueva con otro número y las mismas líneas, vinculada a esta. La anulada se conserva.</p>
          <button type="button" className="btn-primary" disabled={pendiente} data-testid="reemitir-orden"
            onClick={() => { setAviso(null); ejecutar(() => reemitirOrdenBajaAccion(orden.id), { refrescar: false, alExito: (r) => { router.push(`/bajas/${r.id}?nueva=reemitida`) } }) }}><RefreshCw className="h-5 w-5" aria-hidden />{pendiente ? 'Reemitiendo…' : 'Reemitir la Orden'}</button>
        </section>
      )}

      <p className="flex items-center gap-2 text-sm"><Download className="h-4 w-4 text-gray-500" aria-hidden /><Link href="/bajas" className="underline">Volver a todas las bajas</Link></p>
    </div>
  )
}
