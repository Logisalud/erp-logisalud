'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ArrowLeft, Check, Eye, RotateCcw, TriangleAlert } from 'lucide-react'
import { darConformidadAccion, reabrirObservadaAccion } from '@/app/acciones-picking'
import { ETIQUETA_NO_CONFORMIDAD, NO_CONFORMIDADES, motivoNoPuedeConformar, type LineaPickingVista, type OrdenPickingVista, type TipoNoConformidad } from '@/domain/despacho'
import { mesAnio } from '@/domain/salidas'
import type { Rol } from '@/domain/tipos'
import { useAccion } from '../usar-accion'
import { Aviso } from '../entradas/aviso'
import { HojaInferior } from '../hoja-inferior'
import { CHIP_AVISO, CHIP_NEUTRO, CHIP_OK } from '../estilos-opcion'

/** La segunda mirada: otra persona confirma lo pickeado. Conforme mueve las unidades del rack a la zona de conformidad. */
export function OrdenConformidad({ orden, roles, personaId }: { orden: OrdenPickingVista; roles: readonly Rol[]; personaId: string }) {
  const { pendiente, mensaje, ejecutar } = useAccion()
  const [observando, setObservando] = useState<LineaPickingVista | null>(null)
  const lineas = [...orden.lineasDetalle].sort((a, b) => a.ordenRecorrido - b.ordenRecorrido)
  const porConformar = lineas.filter((l) => l.picking === 'PICKEADA' && l.conformidad !== 'CONFORME')
  const todas = lineas.every((l) => l.conformidad === 'CONFORME')
  const propias = porConformar.filter((l) => motivoNoPuedeConformar(roles, personaId, l.pickerId)).length

  return (
    <div className="space-y-4" data-testid="orden-conformidad">
      <Link href="/conformidad" className="inline-flex items-center gap-1.5 text-sm text-gray-700 underline"><ArrowLeft className="h-4 w-4" aria-hidden />Cola de conformidad</Link>
      <header>
        <h1 className="tabular font-heading text-3xl font-semibold uppercase tracking-wide text-gray-900">{orden.pedidoNumero ?? orden.salidaNumero}</h1>
        <p className="mt-1 text-gray-700">{orden.cliente ?? 'Sin cliente'} · {orden.numero}</p>
      </header>
      <p className="text-sm text-gray-700" role="status" data-testid="avance-conformidad">{todas ? 'Todo conforme. El pedido está listo para la documentación.' : `${lineas.filter((l) => l.conformidad === 'CONFORME').length} de ${lineas.length} líneas conformes.`}</p>
      {propias > 0 && <Aviso tipo="info" testid="aviso-otra-persona">{propias === 1 ? 'Una línea la pickeaste tú' : `${propias} líneas las pickeaste tú`}: la conformidad la da otra persona.</Aviso>}
      {mensaje?.tipo === 'error' && <Aviso tipo="error">{mensaje.texto}</Aviso>}

      <ul className="space-y-3">
        {lineas.map((l) => {
          const motivo = motivoNoPuedeConformar(roles, personaId, l.pickerId)
          const verificable = l.picking === 'PICKEADA' && l.conformidad !== 'CONFORME'
          return (
            <li key={l.id} className="rounded-xl border border-gray-200 bg-white p-4" data-testid="linea-conformidad" data-estado={l.conformidad}>
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-medium text-gray-900">{l.producto}</p>
                  <p className="tabular mt-0.5 text-sm text-gray-700">Lote <strong>{l.lote}</strong> · vence {l.vence ? mesAnio(l.vence) : '—'} · {l.ubicacion}</p>
                  <p className="mt-0.5 text-xs text-gray-600">{l.picker ? `Pickeado por ${l.picker}` : l.picking === 'PENDIENTE' ? 'Aún sin pickear' : ''}</p>
                </div>
                <p className="tabular shrink-0 text-right"><strong className="block text-2xl text-gray-900">{l.cantidad.toLocaleString('es-PE')}</strong><span className="text-xs text-gray-600">unidades</span></p>
              </div>
              {l.conformidad === 'CONFORME' && <p className={`mt-3 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${CHIP_OK}`} data-testid="estado-conforme"><Check className="h-3.5 w-3.5" aria-hidden />Conforme · {l.verificador}</p>}
              {l.conformidad === 'OBSERVADA' && (
                <div className={`mt-3 rounded-lg border p-3 text-sm ${CHIP_AVISO}`} data-testid="estado-observada">
                  <p className="flex items-center gap-1.5 font-medium"><TriangleAlert className="h-4 w-4" aria-hidden />Observada: {l.noConformidad ? ETIQUETA_NO_CONFORMIDAD[l.noConformidad] : ''}{l.notaConformidad ? ` — ${l.notaConformidad}` : ''}</p>
                  <p className="mt-1">Observó {l.verificador}.</p>
                  <button type="button" className="btn-secondary btn-sm mt-2" disabled={pendiente} onClick={() => ejecutar(() => reabrirObservadaAccion(l.id, 'Corregida'))} data-testid="corregir-observada"><RotateCcw className="h-4 w-4" aria-hidden />Corregir y volver a picking</button>
                </div>
              )}
              {verificable && l.conformidad === 'PENDIENTE' && (motivo ? <p className={`mt-3 inline-flex rounded-full border px-2.5 py-1 text-xs ${CHIP_NEUTRO}`} data-testid="sin-permiso-conformidad">{motivo}</p> : (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button type="button" className="btn-primary min-h-14" disabled={pendiente} onClick={() => ejecutar(() => darConformidadAccion(l.id, 'CONFORME'))} data-testid="conforme"><Check className="h-5 w-5" aria-hidden />Conforme</button>
                  <button type="button" className="btn-secondary min-h-14" disabled={pendiente} onClick={() => setObservando(l)} data-testid="observar"><Eye className="h-5 w-5" aria-hidden />Observar</button>
                </div>
              ))}
              {l.picking !== 'PICKEADA' && l.conformidad !== 'CONFORME' && <p className={`mt-3 inline-flex rounded-full border px-2.5 py-1 text-xs ${CHIP_NEUTRO}`}>Esperando el picking</p>}
            </li>
          )
        })}
      </ul>
      {observando && <HojaObservar linea={observando} cerrar={() => setObservando(null)} />}
    </div>
  )
}

function HojaObservar({ linea, cerrar }: { linea: LineaPickingVista; cerrar: () => void }) {
  const { pendiente, mensaje, ejecutar } = useAccion()
  const [tipo, setTipo] = useState<TipoNoConformidad | ''>('')
  const [nota, setNota] = useState('')
  return (
    <HojaInferior titulo={`Observar ${linea.lote}`} cerrar={cerrar} testid="hoja-observar">
      <p className="text-sm text-gray-700">{linea.producto} · {linea.cantidad.toLocaleString('es-PE')} u. ¿Qué no coincide?</p>
      <fieldset><legend className="etiqueta">Tipo</legend>
        <div className="grid grid-cols-2 gap-2">{NO_CONFORMIDADES.map((t) => <label key={t} className={`flex min-h-12 items-center rounded-lg border px-3 text-sm ${tipo === t ? 'border-green-700 bg-green-50 font-semibold text-green-900' : 'border-gray-300 text-gray-800'}`}><input type="radio" name="tipo-nc" className="sr-only" checked={tipo === t} onChange={() => setTipo(t)} data-testid={`tipo-${t}`} />{ETIQUETA_NO_CONFORMIDAD[t]}</label>)}</div>
      </fieldset>
      <div><label htmlFor="nota-obs" className="etiqueta">Nota</label><textarea id="nota-obs" rows={3} className="campo py-2" value={nota} onChange={(e) => setNota(e.target.value)} data-testid="nota-observacion" /></div>
      {mensaje?.tipo === 'error' && <Aviso tipo="error">{mensaje.texto}</Aviso>}
      <button type="button" className="btn-primary w-full" disabled={pendiente || !tipo || !nota.trim()} onClick={() => ejecutar(() => darConformidadAccion(linea.id, 'OBSERVADA', nota, tipo || undefined), { alExito: cerrar })} data-testid="enviar-observacion">{pendiente ? 'Guardando…' : 'Registrar la observación'}</button>
    </HojaInferior>
  )
}
