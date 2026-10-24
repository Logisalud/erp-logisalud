'use client'

import Link from 'next/link'
import { useState } from 'react'
import { PackageX, Truck, Undo2 } from 'lucide-react'
import { crearRetornoAccion } from '@/app/acciones-liberacion'
import {
  AYUDA_MOTIVO_RETORNO, AYUDA_REPROGRAMAR, AYUDA_RETORNO, ETIQUETA_MOTIVO_RETORNO, MOTIVOS_RETORNO, siguienteTrasRetorno, validarRetorno,
  type MotivoRetorno, type SalidaParaRetorno,
} from '@/domain/retornos'
import { ETIQUETA_ESTADO_SOLICITUD } from '@/domain/entradas'
import { formatoFecha } from '@/domain/fechas'
import { PILDORA_ACTIVA, PILDORA_INACTIVA_HOVER } from '../estilos-opcion'
import { useAccion } from '../usar-accion'
import { Aviso } from '../entradas/aviso'

const ICONO = { RECHAZADO_CLIENTE: PackageX, NO_ENTREGADO: Truck } as const

/** Registrar el retorno de una Orden de Salida: entra como una recepción tipo devolución (se cuenta al 100 %, queda en Devoluciones y su acta organoléptica decide el destino). */
export function FormRetorno({ salida, puedeAutorizar }: { salida: SalidaParaRetorno; puedeAutorizar: boolean }) {
  const { pendiente, mensaje, ejecutar, limpiar } = useAccion()
  const [motivo, setMotivo] = useState<MotivoRetorno | ''>('')
  const [docTipo, setDocTipo] = useState<'FACTURA' | 'BOLETA'>('FACTURA')
  const [docNumero, setDocNumero] = useState('')
  const [guia, setGuia] = useState(salida.guiaNumero ?? '')
  const [obs, setObs] = useState('')
  const [autorizar, setAutorizar] = useState(false)
  const [cant, setCant] = useState<Record<string, string>>({})
  const [errores, setErrores] = useState<Record<string, string | undefined>>({})
  const [hecho, setHecho] = useState<{ id: string; numero: string; autorizada: boolean } | null>(null)

  const entrada = { salidaId: salida.salidaId, motivo, guiaNumero: guia, docOriginalTipo: docTipo, docOriginalNumero: docNumero, observaciones: obs, lineas: salida.lineas.map((l) => ({ loteId: l.loteId, cantidad: cant[l.loteId] ?? '' })) }
  const enviar = () => {
    limpiar(); setHecho(null)
    const v = validarRetorno(entrada, salida)
    if (!v.ok) { setErrores(v.errores); return }
    setErrores({})
    ejecutar(() => crearRetornoAccion(entrada, autorizar && puedeAutorizar), {
      exito: undefined,
      alExito: (r) => { setHecho({ id: r.id, numero: r.numero, autorizada: r.autorizada }); setCant({}); setMotivo(''); setDocNumero(''); setObs('') },
    })
  }
  const todo = () => setCant(Object.fromEntries(salida.lineas.filter((l) => l.retornable > 0).map((l) => [l.loteId, String(l.retornable)])))
  const sinRetornable = salida.lineas.every((l) => l.retornable === 0)

  return (
    <div className="space-y-6" data-testid="form-retorno">
      <header>
        <p className="flex items-center gap-2 text-sm text-gray-600"><Undo2 className="h-4 w-4" aria-hidden />Retorno de una Orden de Salida</p>
        <h1 className="tabular font-heading text-3xl font-semibold uppercase tracking-wide text-gray-900">{salida.numero}</h1>
        <p className="mt-1 text-gray-700">Propietario <strong>{salida.propietario}</strong>{salida.guiaNumero ? ` · guía ${salida.guiaNumero}` : ''}</p>
        <p className="mt-2 max-w-3xl text-sm text-gray-700">{AYUDA_RETORNO}</p>
        <p className="mt-1 max-w-3xl text-sm text-gray-600">{AYUDA_REPROGRAMAR}</p>
      </header>

      {!salida.confirmada && <Aviso tipo="error" testid="salida-no-salio">La Orden de Salida {salida.numero} todavía no salió: solo lo que ya salió puede volver. Si todavía no salió, se corrige o se cancela en la propia orden.</Aviso>}

      {hecho && (
        <Aviso tipo="ok" testid="retorno-registrado">
          <p className="font-medium">Retorno registrado: <Link href={`/entradas/${hecho.id}`} className="tabular underline" data-testid="ir-solicitud-retorno">{hecho.numero}</Link>.</p>
          <p className="mt-0.5">{siguienteTrasRetorno(hecho.autorizada)}</p>
        </Aviso>
      )}

      {salida.confirmada && (
        <>
          <fieldset className="card">
            <legend className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">1. ¿Por qué vuelve?</legend>
            <div role="radiogroup" aria-label="Motivo del retorno" className="mt-2 grid gap-2 sm:grid-cols-2">
              {MOTIVOS_RETORNO.map((m) => {
                const Icono = ICONO[m]; const on = motivo === m
                return (
                  <button key={m} type="button" role="radio" aria-checked={on} onClick={() => setMotivo(m)} data-testid={`motivo-${m}`}
                    className={`flex min-h-20 items-start gap-3 rounded-lg border p-3 text-left transition duration-fast ${on ? PILDORA_ACTIVA : PILDORA_INACTIVA_HOVER}`}>
                    <Icono className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
                    <span><strong className="block text-sm">{ETIQUETA_MOTIVO_RETORNO[m]}</strong><span className="text-sm font-normal text-gray-700">{AYUDA_MOTIVO_RETORNO[m]}</span></span>
                  </button>
                )
              })}
            </div>
            {errores.motivo && <p className="mt-2 text-sm text-red-800" role="alert">{errores.motivo}</p>}
          </fieldset>

          <section className="card" aria-labelledby="r-lineas">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="r-lineas" className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">2. ¿Qué vuelve?</h2>
              {!sinRetornable && <button type="button" className="btn-secondary btn-sm" onClick={todo} data-testid="volver-todo">Vuelve todo lo que queda</button>}
            </div>
            <p className="text-sm text-gray-600">Lo que vuelve nunca puede ser más de lo que salió, lote por lote.</p>
            {sinRetornable && <div className="mt-2"><Aviso tipo="info">De esta orden ya se anunció el retorno de todo lo que salió: no queda nada por devolver.</Aviso></div>}
            <ul className="mt-3 divide-y divide-gray-100" data-testid="lineas-retorno">
              {salida.lineas.map((l) => (
                <li key={l.loteId} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3" data-testid="linea-retorno">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900">{l.producto}</p>
                    <p className="text-sm text-gray-600">{l.productoCodigo} · lote <strong>{l.lote}</strong>{l.vence ? ` · vence ${formatoFecha(l.vence)}` : ''}</p>
                    <p className="tabular text-sm text-gray-700">Salieron {l.despachado.toLocaleString('es-PE')}{l.yaRetornado ? ` · ya anunciado ${l.yaRetornado.toLocaleString('es-PE')}` : ''} · <strong>pueden volver {l.retornable.toLocaleString('es-PE')}</strong></p>
                  </div>
                  <div className="w-32">
                    <label htmlFor={`c-${l.loteId}`} className="etiqueta">Vuelven</label>
                    <input id={`c-${l.loteId}`} inputMode="numeric" className={`campo tabular ${errores[`cantidad-${l.loteId}`] ? '!border-red-500' : ''}`} value={cant[l.loteId] ?? ''} disabled={l.retornable === 0}
                      onChange={(e) => setCant({ ...cant, [l.loteId]: e.target.value })} autoComplete="off" data-testid="cantidad-retorno" aria-invalid={errores[`cantidad-${l.loteId}`] ? true : undefined} />
                  </div>
                  {errores[`cantidad-${l.loteId}`] && <p className="basis-full text-sm text-red-800" role="alert">{errores[`cantidad-${l.loteId}`]}</p>}
                </li>
              ))}
            </ul>
            {errores.lineas && !Object.keys(errores).some((k) => k.startsWith('cantidad-')) && <p className="mt-2 text-sm text-red-800" role="alert" data-testid="error-lineas">{errores.lineas}</p>}
          </section>

          <section className="card space-y-4" aria-labelledby="r-docs">
            <h2 id="r-docs" className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">3. Documentos</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <div><label htmlFor="r-tipo" className="etiqueta">Documento original</label>
                <select id="r-tipo" className="campo" value={docTipo} onChange={(e) => setDocTipo(e.target.value as 'FACTURA' | 'BOLETA')} data-testid="retorno-doc-tipo"><option value="FACTURA">Factura</option><option value="BOLETA">Boleta</option></select></div>
              <div><label htmlFor="r-num" className="etiqueta">N.° de la factura o boleta</label>
                <input id="r-num" className={`campo tabular ${errores.docOriginal ? '!border-red-500' : ''}`} value={docNumero} onChange={(e) => setDocNumero(e.target.value)} autoComplete="off" placeholder="F001-12345" data-testid="retorno-doc-numero" aria-invalid={errores.docOriginal ? true : undefined} /></div>
              <div><label htmlFor="r-guia" className="etiqueta">Guía de remisión</label>
                <input id="r-guia" className="campo tabular" value={guia} onChange={(e) => setGuia(e.target.value)} autoComplete="off" placeholder="T001-00001234" data-testid="retorno-guia" /></div>
            </div>
            {errores.docOriginal && <p className="text-sm text-red-800" role="alert">{errores.docOriginal}</p>}
            <p className="text-sm text-gray-600">{salida.guiaNumero ? 'La guía se tomó de la Orden de Salida; cámbiala solo si la que volvió con la mercadería es otra.' : 'Esta orden no tiene guía del WMS (es de un cliente): escribe la que viene con la mercadería, si la tienes.'}</p>
            <div><label htmlFor="r-obs" className="etiqueta">Observaciones (opcional)</label><textarea id="r-obs" rows={2} className="campo py-2" value={obs} onChange={(e) => setObs(e.target.value)} data-testid="retorno-observaciones" /></div>
            {puedeAutorizar && (
              <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm text-gray-900">
                <input type="checkbox" className="mt-1 h-5 w-5" checked={autorizar} onChange={(e) => setAutorizar(e.target.checked)} data-testid="retorno-autorizar" />
                <span><strong>Autorizar de una vez.</strong> Queda «por llegar» y el almacén ya puede recibirlo. Si no lo marcas, queda por autorizar.</span>
              </label>
            )}
          </section>

          {mensaje?.tipo === 'error' && <Aviso tipo="error">{mensaje.texto}</Aviso>}
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn-primary" onClick={enviar} disabled={pendiente || sinRetornable} data-testid="registrar-retorno-enviar">{pendiente ? 'Registrando…' : 'Registrar el retorno'}</button>
            <p className="text-sm text-gray-600">Después: {puedeAutorizar ? 'Sandra o Katia autorizan (si no lo hiciste ahora) y ' : 'Sandra o Katia autorizan y '}el almacén lo recibe como devolución.</p>
          </div>
        </>
      )}

      {salida.retornos.length > 0 && (
        <section aria-labelledby="r-previos" data-testid="retornos-previos">
          <h2 id="r-previos" className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">Retornos ya registrados de esta orden</h2>
          <ul className="mt-2 divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 bg-white text-sm">
            {salida.retornos.map((r) => (
              <li key={r.solicitudId} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                <Link href={`/entradas/${r.solicitudId}`} className="tabular font-medium text-gray-900 underline underline-offset-2">{r.solicitudNumero}</Link>
                <span className="text-gray-700">{ETIQUETA_MOTIVO_RETORNO[r.motivo]} · {r.unidades.toLocaleString('es-PE')} unidades · {ETIQUETA_ESTADO_SOLICITUD[r.estado]}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
