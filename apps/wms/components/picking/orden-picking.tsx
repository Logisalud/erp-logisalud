'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ArrowLeft, Check, CircleHelp, FileDown, MapPin, Search } from 'lucide-react'
import { proponerReemplazoAccion, registrarPickingAccion, resolverDiscrepanciaAccion } from '@/app/acciones-picking'
import { ETIQUETA_REEMPLAZO, type LineaPickingVista, type OrdenPickingVista, type ReemplazoVista } from '@/domain/despacho'
import { mesAnio } from '@/domain/salidas'
import { useAccion } from '../usar-accion'
import { Aviso } from '../entradas/aviso'
import { HojaInferior } from '../hoja-inferior'
import { CHIP_AVISO, CHIP_NEUTRO, CHIP_OK } from '../estilos-opcion'

const MOTIVOS = ['No encontré el lote', 'Faltan unidades', 'Está en otra ubicación', 'El producto está dañado'] as const

/** Picking pensado para el celular: una tarjeta por línea, en el orden del recorrido, con dos botones grandes. */
export function OrdenPicking({ orden, puedePickear, puedeResolver }: { orden: OrdenPickingVista; puedePickear: boolean; puedeResolver: boolean }) {
  const { pendiente, mensaje, ejecutar } = useAccion()
  const [reportando, setReportando] = useState<LineaPickingVista | null>(null)
  const [resolviendo, setResolviendo] = useState<LineaPickingVista | null>(null)
  const lineas = [...orden.lineasDetalle].sort((a, b) => a.ordenRecorrido - b.ordenRecorrido)
  const restantes = lineas.filter((l) => l.picking === 'PENDIENTE').length
  const completa = lineas.every((l) => l.picking === 'PICKEADA')

  return (
    <div className="space-y-4" data-testid="orden-picking">
      <Link href="/picking" className="inline-flex items-center gap-1.5 text-sm text-gray-700 underline"><ArrowLeft className="h-4 w-4" aria-hidden />Cola de picking</Link>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="tabular font-heading text-3xl font-semibold uppercase tracking-wide text-gray-900">{orden.pedidoNumero ?? orden.salidaNumero}</h1>
          <p className="mt-1 text-gray-700">{orden.cliente ?? 'Sin cliente'} · {orden.numero}</p>
        </div>
        <Link href={`/picking/${orden.id}/hoja`} target="_blank" className="btn-secondary btn-sm" data-testid="hoja-picking"><FileDown className="h-4 w-4" aria-hidden />Hoja para imprimir</Link>
      </header>
      <p className="text-sm text-gray-700" role="status" data-testid="avance-picking">{completa ? 'Picking completo. Ahora la conformidad la da otra persona.' : `${restantes} ${restantes === 1 ? 'línea por pickear' : 'líneas por pickear'}, en el orden del recorrido.`}</p>
      {mensaje?.tipo === 'error' && <Aviso tipo="error">{mensaje.texto}</Aviso>}
      {!puedePickear && <Aviso tipo="info">Puedes ver el picking; lo registra el personal de almacén.</Aviso>}

      <ol className="space-y-3">
        {lineas.map((l, i) => (
          <li key={l.id} className="rounded-xl border border-gray-200 bg-white p-4" data-testid="linea-picking" data-estado={l.picking}>
            <div className="flex items-start gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-sm font-semibold text-gray-800">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-lg font-semibold text-gray-900"><MapPin className="h-5 w-5 text-gray-600" aria-hidden /><span className="tabular" data-testid="ubicacion-picking">{l.ubicacion}</span></p>
                <p className="mt-1 text-[15px] text-gray-900">{l.producto}</p>
                <p className="tabular text-sm text-gray-700">Lote <strong>{l.lote}</strong> · vence {l.vence ? mesAnio(l.vence) : '—'}</p>
              </div>
              <p className="tabular shrink-0 text-right"><strong className="block text-2xl text-gray-900">{l.cantidad.toLocaleString('es-PE')}</strong><span className="text-xs text-gray-600">unidades</span></p>
            </div>
            {l.picking === 'PENDIENTE' && puedePickear && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" className="btn-primary min-h-14" disabled={pendiente} onClick={() => ejecutar(() => registrarPickingAccion(l.id, 'PICKEADA'))} data-testid="pickeado"><Check className="h-5 w-5" aria-hidden />Pickeado</button>
                <button type="button" className="btn-secondary min-h-14" disabled={pendiente} onClick={() => setReportando(l)} data-testid="no-lo-encuentro"><CircleHelp className="h-5 w-5" aria-hidden />No lo encuentro</button>
              </div>
            )}
            {l.picking === 'PICKEADA' && <p className={`mt-3 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${CHIP_OK}`} data-testid="estado-pickeado"><Check className="h-3.5 w-3.5" aria-hidden />Pickeado por {l.picker ?? '—'}</p>}
            {l.picking === 'DISCREPANCIA' && (
              <div className={`mt-3 rounded-lg border p-3 text-sm ${CHIP_AVISO}`} data-testid="estado-discrepancia">
                <p className="font-medium">Discrepancia: {l.notaPicking}</p>
                {puedeResolver ? <button type="button" className="btn-secondary btn-sm mt-2" onClick={() => setResolviendo(l)} data-testid="resolver-discrepancia"><Search className="h-4 w-4" aria-hidden />Buscar reemplazo</button> : <p className="mt-1">El jefe de almacén o de transporte la resuelve.</p>}
              </div>
            )}
            {l.picking === 'PENDIENTE' && !puedePickear && <p className={`mt-3 inline-flex rounded-full border px-2.5 py-1 text-xs ${CHIP_NEUTRO}`}>Por pickear</p>}
          </li>
        ))}
      </ol>

      {completa && <Link href={`/conformidad/${orden.id}`} className="btn-primary" data-testid="ir-conformidad-orden">Pasar a la conformidad</Link>}
      {reportando && <HojaReporte linea={reportando} cerrar={() => setReportando(null)} />}
      {resolviendo && <HojaReemplazo linea={resolviendo} cerrar={() => setResolviendo(null)} />}
    </div>
  )
}

function HojaReporte({ linea, cerrar }: { linea: LineaPickingVista; cerrar: () => void }) {
  const { pendiente, mensaje, ejecutar } = useAccion()
  const [nota, setNota] = useState('')
  const enviar = () => ejecutar(() => registrarPickingAccion(linea.id, 'DISCREPANCIA', nota), { alExito: cerrar })
  return (
    <HojaInferior titulo={`No encuentro ${linea.lote}`} cerrar={cerrar} testid="hoja-reporte">
      <p className="text-sm text-gray-700">{linea.producto} · {linea.ubicacion}. Cuéntale al jefe qué pasó; él te busca otro lote o ubicación.</p>
      <div className="flex flex-wrap gap-2">{MOTIVOS.map((m) => <button key={m} type="button" className="rounded-full border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 active:bg-gray-100" onClick={() => setNota(m)}>{m}</button>)}</div>
      <div><label htmlFor="nota-disc" className="etiqueta">¿Qué pasó?</label><textarea id="nota-disc" rows={3} className="campo py-2" value={nota} onChange={(e) => setNota(e.target.value)} data-testid="nota-discrepancia" /></div>
      {mensaje?.tipo === 'error' && <Aviso tipo="error">{mensaje.texto}</Aviso>}
      <button type="button" className="btn-primary w-full" disabled={pendiente || !nota.trim()} onClick={enviar} data-testid="enviar-discrepancia">{pendiente ? 'Enviando…' : 'Avisar la discrepancia'}</button>
    </HojaInferior>
  )
}

function HojaReemplazo({ linea, cerrar }: { linea: LineaPickingVista; cerrar: () => void }) {
  const { pendiente, mensaje, ejecutar } = useAccion()
  const [opciones, setOpciones] = useState<ReemplazoVista[] | null>(null)
  useEffect(() => { let vivo = true; proponerReemplazoAccion(linea.id).then((o) => { if (vivo) setOpciones(o) }); return () => { vivo = false } }, [linea.id])
  return (
    <HojaInferior titulo={`Reemplazo de ${linea.lote}`} cerrar={cerrar} testid="hoja-reemplazo">
      <p className="text-sm text-gray-700">{linea.producto} · {linea.cantidad.toLocaleString('es-PE')} u. Primero el mismo lote en otra ubicación; si no hay, el siguiente por vencimiento.</p>
      {opciones === null ? <p className="text-sm text-gray-700" role="status">Buscando…</p> : opciones.length === 0 ? <Aviso tipo="atencion">No hay otro lote ni ubicación con esa cantidad. Habla con Dirección Técnica antes de seguir.</Aviso> : (
        <ul className="space-y-2" data-testid="opciones-reemplazo">
          {opciones.map((o) => (
            <li key={`${o.loteId}-${o.posicionId}`} className="rounded-lg border border-gray-200 p-3">
              <p className="text-xs font-medium text-teal-900">{ETIQUETA_REEMPLAZO[o.motivo]}</p>
              <p className="tabular mt-1 text-gray-900">Lote <strong>{o.lote}</strong> · vence {o.vence ? mesAnio(o.vence) : '—'} · {o.posicion} · hay {o.disponible}</p>
              <button type="button" className="btn-primary btn-sm mt-2" disabled={pendiente} onClick={() => ejecutar(() => resolverDiscrepanciaAccion(linea.id, o.loteId, o.posicionId), { alExito: cerrar })} data-testid="usar-reemplazo">Usar este</button>
            </li>
          ))}
        </ul>
      )}
      {mensaje?.tipo === 'error' && <Aviso tipo="error">{mensaje.texto}</Aviso>}
    </HojaInferior>
  )
}
