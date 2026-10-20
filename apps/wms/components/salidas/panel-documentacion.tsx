'use client'

import Link from 'next/link'
import { useState } from 'react'
import { CheckCircle2, CircleAlert, FileDown, FileText, Hourglass, XCircle } from 'lucide-react'
import { registrarGreAccion, reenviarAvisosPedidosAccion } from '@/app/acciones-picking'
import { ETIQUETA_REQUISITO_CORTA, motivoNoPuedeRegistrarGuia, puedeImprimirPaquete, validarNumeroGre, type ItemPaquete, type PaqueteSalida } from '@/domain/documentacion'
import { ETIQUETA_TIPO_DOCUMENTO, type EstadoRequisito, type RequisitoDocumental } from '@/domain/documentos'
import { mesAnio } from '@/domain/salidas'
import { ETIQUETA_ESTADO_SUNAT, ETIQUETA_MODO, ETIQUETA_ORIGEN, puedeEmitirGuia, type DatosGuia, type EventoPedidos, type ModoNubefact } from '@/domain/guia-electronica'
import type { Rol } from '@/domain/tipos'
import { useAccion } from '../usar-accion'
import { Aviso } from '../entradas/aviso'
import { AnularGuia } from './anular-guia'
import { ConsultarGuia } from './consultar-guia'
import { EmitirGuia } from './emitir-guia'
import { CHIP_AVISO, CHIP_NEUTRO, CHIP_OK } from '../estilos-opcion'

const ROJO = 'border-red-200 bg-red-50 text-red-800'
const chip = (e: EstadoRequisito) => e === 'OK' ? { cls: CHIP_OK, I: CheckCircle2 } : e === 'FALTA' || e === 'VENCIDO' ? { cls: ROJO, I: XCircle } : e === 'VENCE_ANTES_DE_ENTREGA' ? { cls: CHIP_AVISO, I: CircleAlert } : { cls: CHIP_NEUTRO, I: Hourglass }

const ChipRequisito = ({ r }: { r: RequisitoDocumental }) => {
  const m = chip(r.estado)
  return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium leading-none ${m.cls}`} data-testid="chip-requisito" data-estado={r.estado}><m.I className="h-3.5 w-3.5" aria-hidden />{ETIQUETA_TIPO_DOCUMENTO[r.tipo]}: {ETIQUETA_REQUISITO_CORTA[r.estado]}</span>
}

/** Después de la conformidad: la guía de remisión (se registra su número a mano) y el paquete documental de los lotes que salen. */
export function PanelDocumentacion({ paquete, roles, datos, modo, hoy, eventos, greCliente }: { paquete: PaqueteSalida; roles: readonly Rol[]; datos: DatosGuia | null; modo: ModoNubefact; hoy: string; eventos: EventoPedidos[]; greCliente?: { numero?: string; salidaId: string; conArchivo: boolean } }) {
  const { pendiente, mensaje, ejecutar } = useAccion()
  const [resultado, setResultado] = useState<string | null>(null)
  const [numero, setNumero] = useState(greCliente?.numero ?? '')
  const [nota, setNota] = useState('')
  const bloqueo = motivoNoPuedeRegistrarGuia(roles, paquete)
  const errorNumero = numero.trim() ? validarNumeroGre(numero) : null
  const puedeImprimir = puedeImprimirPaquete(roles)
  const exigidos = (i: ItemPaquete) => i.requisitos.filter((r) => r.exigido)

  return (
    <section aria-labelledby="h-doc" className="space-y-4" data-testid="panel-documentacion">
      <h2 id="h-doc" className="font-heading text-xl font-medium tracking-wide text-gray-900">Documentación final</h2>
      {resultado && <Aviso tipo="ok" testid="resultado-guia">{resultado}</Aviso>}
      {!paquete.conforme && !paquete.guia && <Aviso tipo="info">La guía se registra cuando todo el pedido tiene la conformidad: sus lotes salen de lo confirmado, sin volver a escribirlos.</Aviso>}

      <div className="rounded-lg border border-gray-200 bg-white p-4" data-testid="bloque-guia">
        <h3 className="font-medium text-gray-900">{greCliente ? 'Guía de remisión del cliente (GRE)' : 'Guía de remisión'}</h3>
        {greCliente && !paquete.guia && <p className="mt-1 text-sm text-gray-700" data-testid="gre-cliente-explica">El WMS no emite guía en esta orden: se despacha con la GRE que trajo el cliente{greCliente.numero ? <> (<span className="tabular font-medium">{greCliente.numero}</span>)</> : null}. Cuando todo esté conforme, registra su número aquí.</p>}
        {paquete.guia ? (
          <div className="mt-2 space-y-2">
            <p className="text-gray-900"><strong className="tabular" data-testid="guia-numero">{paquete.guia.numero}</strong> <span className="text-sm text-gray-700">· registrada por {paquete.guia.registradaPor}{paquete.guia.placa ? ` · placa ${paquete.guia.placa}` : ''}</span></p>
            <p className="flex flex-wrap items-center gap-2 text-xs text-gray-800" data-testid="guia-origen">
              <span className={`rounded-full border px-2.5 py-1 ${CHIP_NEUTRO}`}>{ETIQUETA_ORIGEN[paquete.guia.origen]}</span>
              {paquete.guia.entorno && <span className={`rounded-full border px-2.5 py-1 ${CHIP_NEUTRO}`}>{ETIQUETA_MODO[paquete.guia.entorno]}</span>}
              {paquete.guia.estadoSunat && <span className={`rounded-full border px-2.5 py-1 ${paquete.guia.estadoSunat === 'ACEPTADA' ? CHIP_OK : CHIP_AVISO}`}>{ETIQUETA_ESTADO_SUNAT[paquete.guia.estadoSunat]}</span>}
              {paquete.guia.enlace && <Link href={paquete.guia.enlace} target="_blank" className="underline" data-testid="guia-pdf">Ver el PDF</Link>}
              {paquete.guia.enlaceXml && <Link href={paquete.guia.enlaceXml} target="_blank" className="underline">Ver el XML</Link>}
            </p>
            <ul className="text-sm text-gray-800" data-testid="guia-lineas">{paquete.guia.lineas.map((l, k) => <li key={k} className="tabular">{l.productoCodigo} · lote {l.lote} · vence {l.vence ? mesAnio(l.vence) : '—'} · {l.cantidad.toLocaleString('es-PE')} u</li>)}</ul>
            {paquete.guia.estadoSunat === 'PENDIENTE' && !bloqueo?.startsWith('No tienes') && <ConsultarGuia guiaId={paquete.guia.id} numero={paquete.guia.numero} salidaId={paquete.salidaId} alConsultar={setResultado} />}
            {!bloqueo?.startsWith('No tienes') && <AnularGuia guiaId={paquete.guia.id} alAnular={setResultado} />}
            <p className="text-xs text-gray-600">Una guía no se edita: si hay un error, se anula con el motivo y se emite la correcta.</p>
          </div>
        ) : (
          <div className="mt-2 space-y-3">
            {paquete.conforme && datos && datos.tipo !== 'CLIENTE' && puedeEmitirGuia(roles) && <EmitirGuia datos={datos} modo={modo} hoy={hoy} alEmitir={setResultado} />}
            <details className="rounded-md border border-gray-200 p-3" data-testid="gre-manual" open={!!greCliente}>
              <summary className="cursor-pointer text-sm font-medium text-gray-900" data-testid="abrir-gre-manual">{greCliente ? 'Registrar la GRE del cliente' : 'Registrar una guía a mano (contingencia, o la GRE que trae el cliente)'}</summary>
              <div className="mt-3 space-y-3">
                <p className="text-sm text-gray-700">Aquí registras el número de una guía emitida fuera del WMS; sus líneas salen de lo que confirmó la conformidad.</p>
                <div className="grid gap-3 sm:grid-cols-[minmax(0,16rem)_1fr]">
                  <div>
                    <label htmlFor="numero-gre" className="etiqueta">N.° de la guía</label>
                    <input id="numero-gre" className="campo tabular uppercase" placeholder="T001-00001234" value={numero} onChange={(e) => setNumero(e.target.value)} disabled={!!bloqueo} aria-invalid={!!errorNumero} data-testid="numero-gre" />
                    {errorNumero && <p className="mt-1 text-sm text-red-800" role="alert" data-testid="error-numero-gre">{errorNumero}</p>}
                  </div>
                  <div>
                    <label htmlFor="nota-gre" className="etiqueta">Nota (opcional)</label>
                    <input id="nota-gre" className="campo" value={nota} onChange={(e) => setNota(e.target.value)} disabled={!!bloqueo} />
                  </div>
                </div>
                {bloqueo && <p className="text-sm text-gray-700" data-testid="gre-bloqueada">{bloqueo}</p>}
                <button type="button" className="btn-secondary" disabled={!!bloqueo || pendiente || !numero.trim() || !!errorNumero} onClick={() => ejecutar(() => registrarGreAccion(paquete.salidaId, numero, nota), { alExito: () => { setNumero(''); setNota('') } })} data-testid="registrar-gre">{pendiente ? 'Registrando…' : 'Registrar la guía'}</button>
              </div>
            </details>
          </div>
        )}
        {paquete.guiasAnuladas.length > 0 && (
          <details className="mt-3 text-sm text-gray-700" data-testid="guias-anuladas"><summary className="cursor-pointer">Guías anuladas ({paquete.guiasAnuladas.length})</summary>
            <ul className="mt-1 space-y-1">{paquete.guiasAnuladas.map((g) => <li key={g.id} className="tabular">{g.numero}{g.casoAnulacion ? ` (caso ${g.casoAnulacion})` : ''} — {g.anuladaMotivo}</li>)}</ul></details>
        )}
        {mensaje?.tipo === 'error' && <div className="mt-3"><Aviso tipo="error">{mensaje.texto}</Aviso></div>}
        {eventos.length > 0 && <AvisosPedidos eventos={eventos} />}
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4" data-testid="bloque-paquete">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h3 className="font-medium text-gray-900">Paquete documental</h3><p className="text-sm text-gray-700">Los documentos de los lotes exactos que salen en este pedido.</p></div>
          {puedeImprimir && <Link href={`/salidas/${paquete.salidaId}/paquete`} target="_blank" className="btn-secondary btn-sm" data-testid="imprimir-paquete"><FileDown className="h-4 w-4" aria-hidden />Imprimir paquete (un solo PDF)</Link>}
        </div>
        {paquete.completo
          ? <p className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-green-800" data-testid="paquete-completo"><CheckCircle2 className="h-4 w-4" aria-hidden />Paquete completo</p>
          : <div className="mt-3"><Aviso tipo="atencion" testid="paquete-incompleto"><strong>Falta completar:</strong> {paquete.faltantes.join('; ')}. <Link href="/documentos" className="underline">Ir a Documentos</Link></Aviso></div>}
        <ul className="mt-3 divide-y divide-gray-100" data-testid="items-paquete">
          {paquete.items.map((i) => (
            <li key={`${i.lineaId}-${i.loteId}`} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
              <div className="min-w-0 basis-60 flex-1"><p className="truncate font-medium text-gray-900">{i.producto}</p><p className="tabular text-sm text-gray-700">Lote {i.lote} · {i.cantidad.toLocaleString('es-PE')} u</p></div>
              <div className="flex flex-wrap gap-1.5">{exigidos(i).length ? exigidos(i).map((r) => <ChipRequisito key={r.tipo} r={r} />) : <span className="text-sm text-gray-600"><FileText className="mr-1 inline h-4 w-4" aria-hidden />El cliente no pide documentos</span>}</div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

/** Qué se le avisó a Pedidos (número de guía y lotes, o la anulación) y cómo va el envío; lo pendiente se reintenta con un botón. */
function AvisosPedidos({ eventos }: { eventos: EventoPedidos[] }) {
  const { pendiente, ejecutar } = useAccion()
  const faltan = eventos.filter((e) => e.estado === 'PENDIENTE')
  return (
    <div className="mt-3 text-sm text-gray-800" data-testid="avisos-pedidos">
      <p className="font-medium text-gray-900">Avisos a Pedidos</p>
      <ul className="mt-1 space-y-1">
        {eventos.map((e) => (
          <li key={e.id} className="flex flex-wrap items-center gap-2" data-testid="aviso-pedidos" data-estado={e.estado}>
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${e.estado === 'ENVIADO' ? CHIP_OK : CHIP_AVISO}`}>{e.estado === 'ENVIADO' ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> : <Hourglass className="h-3.5 w-3.5" aria-hidden />}{e.estado === 'ENVIADO' ? 'Enviado' : 'Pendiente'}</span>
            <span>{e.tipo === 'GUIA_EMITIDA' ? 'Guía emitida' : 'Guía anulada'} · {String(e.payload.guia)}{e.ultimoError ? ` · ${e.ultimoError}` : ''}</span>
          </li>
        ))}
      </ul>
      {faltan.length > 0 && <button type="button" className="btn-secondary btn-sm mt-2" disabled={pendiente} onClick={() => ejecutar(async () => { const r = await reenviarAvisosPedidosAccion(faltan[0].salidaId); return r.pendientes === 0 ? { ok: true as const } : { ok: false as const, mensaje: r.mensaje ?? 'Pedidos no respondió' } })} data-testid="reenviar-avisos">Reintentar el envío</button>}
    </div>
  )
}
