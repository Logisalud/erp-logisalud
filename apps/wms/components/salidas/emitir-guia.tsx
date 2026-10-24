'use client'

import { useState } from 'react'
import { FlaskConical, Send, ShieldAlert, Truck, TriangleAlert } from 'lucide-react'
import { emitirGuiaElectronicaAccion } from '@/app/acciones-picking'
import { ETIQUETA_MODO, PESO_BRUTO_DEFECTO_KG, faltantesDeGuia, type DatosGuia, type ModoNubefact } from '@/domain/guia-electronica'
import { mesAnio } from '@/domain/salidas'
import { useAccion } from '../usar-accion'
import { Aviso } from '../entradas/aviso'

/** «Emitir guía»: todo sale solo del WMS; el Jefe de Transporte confirma la fecha de inicio del traslado y el peso bruto (12 kg por defecto). */
export function EmitirGuia({ datos, modo, hoy, alEmitir }: { datos: DatosGuia; modo: ModoNubefact; hoy: string; alEmitir: (texto: string) => void }) {
  const { pendiente, mensaje, ejecutar } = useAccion()
  const [fecha, setFecha] = useState(hoy)
  const [peso, setPeso] = useState(String(PESO_BRUTO_DEFECTO_KG))
  const [licencia, setLicencia] = useState('')
  const traslado = { fechaInicio: fecha, pesoKg: Number(peso.replace(',', '.')), licenciaConductor: licencia }
  const faltan = faltantesDeGuia(datos, traslado, modo)
  const d = datos
  const real = modo !== 'SIMULADOR'

  return (
    <div className="mt-2 space-y-4" data-testid="emitir-guia">
      <p className="inline-flex items-center gap-1.5 rounded-full border border-gray-300 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-800" data-testid="modo-nubefact" data-modo={modo}>
        {real ? <ShieldAlert className="h-4 w-4" aria-hidden /> : <FlaskConical className="h-4 w-4" aria-hidden />}{ETIQUETA_MODO[modo]}
      </p>

      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2" data-testid="datos-guia">
        <div><dt className="text-gray-600">Cliente</dt><dd className="text-gray-900">{d.destinatario.nombre ?? '—'}{d.destinatario.ruc ? ` · RUC ${d.destinatario.ruc}` : ''}</dd></div>
        <div><dt className="text-gray-600">Entrega</dt><dd className="text-gray-900">{d.destinatario.direccion ?? '—'}{d.destinatario.ubigeo ? ` (ubigeo ${d.destinatario.ubigeo})` : ''}</dd></div>
        <div><dt className="text-gray-600">Sale de</dt><dd className="text-gray-900">{d.partida.direccion || '—'} (ubigeo {d.partida.ubigeo})</dd></div>
        <div><dt className="text-gray-600">Motivo y transporte</dt><dd className="text-gray-900">{d.motivoTraslado} · {d.modalidad}</dd></div>
        <div><dt className="text-gray-600">Ruta</dt><dd className="text-gray-900" data-testid="guia-ruta">{d.ruta ? <><Truck className="mr-1 inline h-4 w-4" aria-hidden />{d.ruta.numero} · {d.ruta.fecha} · {d.ruta.placa ?? 'sin vehículo'} · {d.ruta.conductor ?? 'sin conductor'}</> : 'Sin ruta todavía'}</dd></div>
        {d.ruta?.conductorReal && d.ruta.conductorReal !== d.ruta.conductor && (
          <div className="sm:col-span-2" data-testid="guia-conductor-documentos"><dt className="text-gray-600">Conductor en la guía</dt><dd className="flex items-start gap-2 text-gray-900"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-800" aria-hidden />La guía lleva a {d.ruta.conductor}. El conductor real de la ruta es {d.ruta.conductorReal} y así queda registrado junto con la guía.</dd></div>
        )}
        <div><dt className="text-gray-600">Bultos</dt><dd className="tabular text-gray-900">{d.bultos}</dd></div>
      </dl>
      <ul className="text-sm text-gray-800" data-testid="guia-lineas-previa">
        {d.lineas.map((l, k) => <li key={k} className="tabular">{l.productoCodigo} · lote {l.lote} · vence {l.vence ? mesAnio(l.vence) : '—'} · {l.cantidad.toLocaleString('es-PE')} u</li>)}
      </ul>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,12rem)_minmax(0,10rem)_minmax(0,14rem)]">
        <div>
          <label htmlFor="fecha-traslado" className="etiqueta">Inicio del traslado</label>
          <input id="fecha-traslado" type="date" className="campo tabular" value={fecha} min={hoy} onChange={(e) => setFecha(e.target.value)} data-testid="fecha-traslado" />
        </div>
        <div>
          <label htmlFor="peso-bruto" className="etiqueta">Peso bruto (kg)</label>
          <input id="peso-bruto" inputMode="decimal" className="campo tabular" value={peso} onChange={(e) => setPeso(e.target.value.replace(/[^0-9.,]/g, ''))} data-testid="peso-bruto" />
        </div>
        {!d.ruta?.conductorLicencia && (
          <div>
            <label htmlFor="licencia" className="etiqueta">Licencia del conductor</label>
            <input id="licencia" className="campo tabular uppercase" value={licencia} onChange={(e) => setLicencia(e.target.value)} data-testid="licencia-conductor" />
          </div>
        )}
      </div>

      {faltan.length > 0 && (
        <Aviso tipo="atencion" testid="guia-faltan"><strong>Antes de emitir:</strong> {faltan.join('. ')}.</Aviso>
      )}
      {mensaje?.tipo === 'error' && <Aviso tipo="error" testid="error-emitir-guia">{mensaje.texto}</Aviso>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn-primary" disabled={pendiente || faltan.length > 0} data-testid="emitir-guia-boton"
          onClick={() => ejecutar(() => emitirGuiaElectronicaAccion(d.salidaId, traslado), {
            alExito: (r) => alEmitir(`Guía ${r.numero} emitida (${ETIQUETA_MODO[r.entorno as ModoNubefact]}). ${r.estadoSunat === 'ACEPTADA' ? `SUNAT la aceptó. ${r.pedidos === 'ENVIADO' ? 'Pedidos ya tiene el número y los lotes.' : 'El aviso a Pedidos quedó en la bandeja y se reintenta.'} Siguiente: completa el paquete documental, el embalaje si va a provincia y la carga.` : 'SUNAT todavía no responde. Siguiente: pulsa «Consultar estado en SUNAT» en unos minutos; cuando la acepte, Pedidos recibe el número y podrás cargar.'}`),
          })}>
          <Send className="h-5 w-5" aria-hidden />{pendiente ? 'Emitiendo…' : 'Emitir guía'}
        </button>
        <span className="text-sm text-gray-700">Se envía a Nubefact con lo que confirmó la conformidad. Si SUNAT la rechaza, verás el motivo y la corriges.</span>
      </div>
    </div>
  )
}
