'use client'

import Link from 'next/link'
import { useCallback, useRef, useState } from 'react'
import { ArrowLeft, Ban, Check, CheckCircle2, ListChecks, PackageCheck, ScanLine, Truck, Undo2, XCircle } from 'lucide-react'
import { cargarBultoAccion, confirmarSalidaRutaAccion, excluirPedidoAccion, guardarChecklistAccion, liberarUnidadAccion, retirarBultoAccion } from '@/app/acciones-picking'
import { ETIQUETA_ESTADO_CARGA, type CargaRuta, type ItemChecklist } from '@/domain/carga'
import { useAccion } from '../usar-accion'
import { Aviso } from '../entradas/aviso'
import { CHIP_AVISO, CHIP_NEUTRO, CHIP_OK } from '../estilos-opcion'
import { LectorCamara } from './lector-camara'

const ROJO = 'border-red-200 bg-red-50 text-red-800'
const hora = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' }) : '')

/** La carga de una ruta: checklist del vehículo, escaneo de bultos, conciliación por pedido, liberar la unidad y confirmar la salida. */
export function PanelCarga({ carga, puedeCargar, puedeLiberar, puedeConfirmar }: { carga: CargaRuta; puedeCargar: boolean; puedeLiberar: boolean; puedeConfirmar: boolean }) {
  const { pendiente, mensaje, ejecutar } = useAccion()
  const enCarga = carga.estado === 'EN_CARGA'
  const [codigo, setCodigo] = useState('')
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const [items, setItems] = useState<ItemChecklist[]>(() => carga.checklist ?? carga.itemsChecklist.map((item) => ({ item, ok: true, nota: '' })))
  const [retirando, setRetirando] = useState<string | null>(null)
  const [excluyendo, setExcluyendo] = useState<string | null>(null)
  const [motivo, setMotivo] = useState('')
  const [confirmando, setConfirmando] = useState(false)
  const entrada = useRef<HTMLInputElement>(null)

  const escanear = useCallback((cod: string) => {
    const c = cod.trim()
    if (!c) return
    ejecutar(() => cargarBultoAccion(carga.rutaId, c), {
      alExito: (r) => { setAviso({ tipo: 'ok', texto: r.resultado === 'YA_CARGADO' ? `${c.toUpperCase()} ya estaba cargado` : `${c.toUpperCase()} cargado` }); setCodigo(''); entrada.current?.focus() },
    })
  }, [ejecutar, carga.rutaId])

  const listosParaLiberar = carga.motivosNoLiberar.length === 0
  const checklistMalo = items.some((i) => !i.ok && !i.nota.trim())

  return (
    <div className="space-y-5" data-testid="panel-carga">
      <Link href="/carga" className="inline-flex items-center gap-1.5 text-sm text-gray-700 underline"><ArrowLeft className="h-4 w-4" aria-hidden />Carga</Link>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="tabular font-heading text-3xl font-semibold uppercase tracking-wide text-gray-900">{carga.rutaNumero}</h1>
          <p className="mt-1 text-gray-700">{carga.placa ?? 'Sin vehículo'}{carga.conductor ? ` · ${carga.conductor}` : ''} · {carga.bultosCargados} de {carga.bultosEsperados} bultos cargados</p>
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${enCarga ? CHIP_AVISO : CHIP_OK}`} data-testid="estado-carga"><Truck className="h-3.5 w-3.5" aria-hidden />{ETIQUETA_ESTADO_CARGA[carga.estado]}</span>
      </header>
      {mensaje?.tipo === 'error' && <Aviso tipo="error">{mensaje.texto}</Aviso>}

      {carga.estado === 'EN_RUTA' && <Aviso tipo="ok" testid="salida-confirmada">Salida confirmada a las {hora(carga.salioEn)}. El stock de los pedidos que salieron ya se descontó.</Aviso>}

      {/* 1. Checklist */}
      <section className="rounded-lg border border-gray-200 bg-white p-4" aria-labelledby="h-check" data-testid="bloque-checklist">
        <h2 id="h-check" className="flex items-center gap-2 font-medium text-gray-900"><ListChecks className="h-5 w-5" aria-hidden />1. Checklist del vehículo</h2>
        <ul className="mt-3 space-y-3">
          {items.map((i, k) => (
            <li key={i.item} data-testid="punto-checklist">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[15px] text-gray-900">{i.item}</span>
                <div className="inline-flex shrink-0 overflow-hidden rounded-full border border-gray-300" role="group" aria-label={i.item}>
                  <button type="button" disabled={!enCarga || !puedeCargar} aria-pressed={i.ok} onClick={() => setItems((x) => x.map((y, j) => (j === k ? { ...y, ok: true } : y)))} className={`min-h-11 px-4 text-sm ${i.ok ? 'bg-green-50 font-semibold text-green-900' : 'text-gray-800'}`} data-testid="punto-si">Sí</button>
                  <button type="button" disabled={!enCarga || !puedeCargar} aria-pressed={!i.ok} onClick={() => setItems((x) => x.map((y, j) => (j === k ? { ...y, ok: false } : y)))} className={`min-h-11 border-l border-gray-300 px-4 text-sm ${!i.ok ? 'bg-red-50 font-semibold text-red-900' : 'text-gray-800'}`} data-testid="punto-no">No</button>
                </div>
              </div>
              {!i.ok && <input className="campo mt-2" placeholder="¿Qué pasa? (obligatorio)" aria-label={`Nota de ${i.item}`} value={i.nota} disabled={!enCarga || !puedeCargar} onChange={(e) => setItems((x) => x.map((y, j) => (j === k ? { ...y, nota: e.target.value } : y)))} data-testid="nota-punto" />}
            </li>
          ))}
        </ul>
        {enCarga && puedeCargar && <button type="button" className="btn-secondary btn-sm mt-3" disabled={pendiente || checklistMalo} onClick={() => ejecutar(() => guardarChecklistAccion(carga.rutaId, items))} data-testid="guardar-checklist">Guardar el checklist</button>}
        {carga.checklist && <p className="mt-2 flex items-center gap-1.5 text-sm text-gray-700" data-testid="checklist-guardado"><CheckCircle2 className="h-4 w-4 text-green-700" aria-hidden />Guardado por {carga.checklistPor ?? '—'}{carga.checklist.some((c) => !c.ok) ? ' · hay puntos sin cumplir' : ''}</p>}
      </section>

      {/* 2. Escaneo */}
      {enCarga && puedeCargar && (
        <section className="rounded-lg border border-gray-200 bg-white p-4" aria-labelledby="h-esc" data-testid="bloque-escaneo">
          <h2 id="h-esc" className="flex items-center gap-2 font-medium text-gray-900"><ScanLine className="h-5 w-5" aria-hidden />2. Cargar los bultos</h2>
          <p className="mt-1 text-sm text-gray-700">Escanea el QR de la etiqueta (lector o cámara) o escribe el código y pulsa Enter.</p>
          <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); escanear(codigo) }}>
            <div className="min-w-0 flex-1 basis-56"><label htmlFor="codigo-bulto" className="etiqueta">Código del bulto</label><input id="codigo-bulto" ref={entrada} className="campo tabular uppercase" placeholder="SAL-2026-00001-B1" autoComplete="off" value={codigo} onChange={(e) => setCodigo(e.target.value)} data-testid="codigo-bulto" /></div>
            <button type="submit" className="btn-primary" disabled={pendiente || !codigo.trim()} data-testid="cargar-bulto">Cargar</button>
            <LectorCamara alLeer={escanear} />
          </form>
          {aviso && <p className="mt-2 text-sm text-green-800" role="status" data-testid="aviso-escaneo">{aviso.texto}</p>}
        </section>
      )}

      {/* 3. Conciliación */}
      <section aria-labelledby="h-conc" data-testid="bloque-conciliacion">
        <h2 id="h-conc" className="mb-2 flex items-center gap-2 font-heading text-xl font-medium tracking-wide text-gray-900"><PackageCheck className="h-5 w-5" aria-hidden />3. Conciliación por pedido</h2>
        <ul className="space-y-3">
          {carga.pedidosDetalle.map((p) => (
            <li key={p.salidaId} className="rounded-xl border border-gray-200 bg-white p-4" data-testid="pedido-carga" data-excluido={p.excluida ? 'si' : 'no'}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div><p className="tabular font-semibold text-gray-900">{p.secuencia}. {p.pedidoNumero ?? p.salidaNumero}</p><p className="text-sm text-gray-700">{p.cliente ?? 'Sin cliente'} · {p.salidaNumero}</p></div>
                {p.excluida ? <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${CHIP_NEUTRO}`}><Ban className="h-3.5 w-3.5" aria-hidden />Fuera de esta salida</span>
                  : p.listo ? <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${CHIP_OK}`}><Check className="h-3.5 w-3.5" aria-hidden />Listo para carga</span>
                  : <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${ROJO}`}><XCircle className="h-3.5 w-3.5" aria-hidden />No está listo para carga</span>}
              </div>
              {p.excluida && <p className="mt-2 text-sm text-gray-700" data-testid="motivo-exclusion">Motivo: {p.motivoExclusion}</p>}
              {!p.excluida && !p.listo && <p className="mt-2 text-sm text-amber-900">Faltan la guía, el paquete documental completo o el embalaje. <Link href={`/salidas/${p.salidaId}`} className="underline">Abrir la salida</Link></p>}
              {!p.excluida && p.bultos.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-2" data-testid="bultos-pedido">
                  {p.bultos.map((b) => (
                    <li key={b.bultoId} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${b.cargado ? CHIP_OK : CHIP_AVISO}`} data-testid="bulto-carga" data-cargado={b.cargado ? 'si' : 'no'}>
                      {b.cargado ? <Check className="h-4 w-4" aria-hidden /> : <XCircle className="h-4 w-4" aria-hidden />}
                      <span className="tabular">Bulto {b.secuencia} de {b.total}</span><span className="text-xs">{b.cargado ? 'Cargado' : 'Falta'}</span>
                      {enCarga && puedeCargar && !b.cargado && p.listo && <button type="button" className="min-h-9 rounded-full border border-current px-2.5 text-xs" disabled={pendiente} onClick={() => escanear(b.codigo)} data-testid="marcar-cargado">Marcar cargado</button>}
                      {enCarga && puedeCargar && b.cargado && <button type="button" className="inline-flex min-h-9 items-center gap-1 rounded-full border border-current px-2.5 text-xs" onClick={() => { setRetirando(b.codigo); setMotivo('') }} data-testid="retirar-bulto"><Undo2 className="h-3.5 w-3.5" aria-hidden />Retirar</button>}
                    </li>
                  ))}
                </ul>
              )}
              {retirando && p.bultos.some((b) => b.codigo === retirando) && (
                <div className="mt-3 space-y-2" data-testid="form-retirar">
                  <label htmlFor="motivo-retiro" className="etiqueta">¿Por qué se retira {retirando}?</label>
                  <input id="motivo-retiro" className="campo" value={motivo} onChange={(e) => setMotivo(e.target.value)} data-testid="motivo-retiro" />
                  <div className="flex gap-2"><button type="button" className="btn-primary btn-sm" disabled={pendiente || !motivo.trim()} onClick={() => ejecutar(() => retirarBultoAccion(carga.rutaId, retirando, motivo), { alExito: () => setRetirando(null) })} data-testid="confirmar-retiro">Retirar</button><button type="button" className="btn-secondary btn-sm" onClick={() => setRetirando(null)}>Cancelar</button></div>
                </div>
              )}
              {enCarga && puedeLiberar && !p.excluida && (excluyendo === p.salidaId ? (
                <div className="mt-3 space-y-2" data-testid="form-excluir">
                  <label htmlFor="motivo-excluir" className="etiqueta">¿Por qué el pedido se deja fuera de esta salida?</label>
                  <input id="motivo-excluir" className="campo" value={motivo} onChange={(e) => setMotivo(e.target.value)} data-testid="motivo-excluir" />
                  <div className="flex gap-2"><button type="button" className="btn-primary btn-sm" disabled={pendiente || !motivo.trim()} onClick={() => ejecutar(() => excluirPedidoAccion(carga.rutaId, p.salidaId, motivo), { alExito: () => setExcluyendo(null) })} data-testid="confirmar-excluir">Dejarlo fuera</button><button type="button" className="btn-secondary btn-sm" onClick={() => setExcluyendo(null)}>Cancelar</button></div>
                </div>
              ) : <button type="button" className="btn-secondary btn-sm mt-3" onClick={() => { setExcluyendo(p.salidaId); setMotivo('') }} data-testid="excluir-pedido"><Ban className="h-4 w-4" aria-hidden />Dejar este pedido fuera de la salida</button>)}
            </li>
          ))}
        </ul>
      </section>

      {/* 4. Liberar y confirmar */}
      <section className="rounded-lg border border-gray-200 bg-white p-4" aria-labelledby="h-lib" data-testid="bloque-liberar">
        <h2 id="h-lib" className="font-medium text-gray-900">4. Liberar la unidad y confirmar la salida</h2>
        {enCarga && (
          <>
            {!listosParaLiberar && <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900" data-testid="motivos-no-liberar">{carga.motivosNoLiberar.map((m) => <li key={m}>{m}</li>)}</ul>}
            {puedeLiberar
              ? <button type="button" className="btn-primary mt-3" disabled={pendiente || !listosParaLiberar} onClick={() => ejecutar(() => liberarUnidadAccion(carga.rutaId))} data-testid="liberar-unidad"><Truck className="h-5 w-5" aria-hidden />Liberar la unidad</button>
              : <p className="mt-2 text-sm text-gray-700">La unidad la libera el Jefe de Transporte.</p>}
          </>
        )}
        {carga.estado === 'LIBERADA' && (
          <div className="mt-2 space-y-3">
            <p className="flex items-center gap-1.5 text-sm font-medium text-green-800" data-testid="unidad-liberada"><CheckCircle2 className="h-4 w-4" aria-hidden />Unidad liberada a las {hora(carga.liberadaEn)}.</p>
            <p className="text-sm text-gray-700">Al confirmar la salida, el stock de estos pedidos sale del almacén. No se puede deshacer desde aquí.</p>
            {puedeConfirmar ? (confirmando
              ? <div className="flex flex-wrap gap-2"><button type="button" className="btn-primary" disabled={pendiente} onClick={() => ejecutar(() => confirmarSalidaRutaAccion(carga.rutaId), { alExito: () => setConfirmando(false) })} data-testid="confirmar-salida-si">{pendiente ? 'Confirmando…' : 'Sí, confirmar la salida'}</button><button type="button" className="btn-secondary" onClick={() => setConfirmando(false)}>Todavía no</button></div>
              : <button type="button" className="btn-primary" onClick={() => setConfirmando(true)} data-testid="confirmar-salida"><PackageCheck className="h-5 w-5" aria-hidden />Confirmar la salida</button>)
              : <p className="text-sm text-gray-700">La salida la confirma el Jefe de Transporte.</p>}
          </div>
        )}
        {carga.estado === 'EN_RUTA' && <p className="mt-2 text-sm text-gray-700">La ruta ya salió. El formato LS-FR.43.03 lleva la hora real de salida: <Link href={`/rutas/${carga.rutaId}`} className="underline">ver la ruta</Link>.</p>}
      </section>
    </div>
  )
}
