'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, FileText, Hourglass, Printer, Send, XCircle } from 'lucide-react'
import { cancelarPreGuiaAccion, crearPreGuiaAccion } from '@/app/acciones-picking'
import { ETIQUETA_ESTADO_PRE_GUIA, faltaParaEnviar, type EstadoPreGuia, type PreGuiaVista } from '@/domain/pre-guia'
import { useAccion } from '../usar-accion'
import { Aviso } from '../entradas/aviso'
import { CHIP_AVISO, CHIP_NEUTRO, CHIP_OK } from '../estilos-opcion'

const ROJO = 'border-red-200 bg-red-50 text-red-800'
const chip = 'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium leading-none whitespace-nowrap'

/** La pre-guía de la orden: el borrador con el número ya reservado. Se imprime; se envía a Nubefact (con ese mismo número) cuando la orden tiene ruta, vehículo y conductor. */
export function PanelPreGuia({ salidaId, conforme, preGuia, puedeGestionar }: { salidaId: string; conforme: boolean; preGuia: PreGuiaVista | null; puedeGestionar: boolean }) {
  const router = useRouter()
  const { pendiente, mensaje, ejecutar } = useAccion()
  const [cancelando, setCancelando] = useState(false)
  const [motivo, setMotivo] = useState('')
  if (!preGuia && !conforme) return null
  const m: Record<EstadoPreGuia, { cls: string; Icono: typeof Hourglass }> = {
    PRE_GUIA: { cls: CHIP_AVISO, Icono: Hourglass }, LISTA_PARA_ENVIAR: { cls: CHIP_OK, Icono: CheckCircle2 }, ENVIADA: { cls: CHIP_OK, Icono: Send }, CANCELADA: { cls: ROJO, Icono: XCircle },
  }
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4" aria-labelledby="t-pre-guia" data-testid="panel-pre-guia">
      <h2 id="t-pre-guia" className="flex items-center gap-2 font-heading text-xl font-medium tracking-wide text-gray-900"><FileText className="h-5 w-5" aria-hidden />Pre-guía</h2>
      {!preGuia ? (
        <div className="mt-2 space-y-2">
          <p className="text-sm text-gray-700">Esta orden ya tiene su conformidad pero todavía no tiene pre-guía. Al crearla se reserva el siguiente número de la serie.</p>
          {puedeGestionar && <button type="button" className="btn-primary" disabled={pendiente} onClick={() => ejecutar(() => crearPreGuiaAccion(salidaId), { alExito: () => router.refresh() })} data-testid="crear-pre-guia">Crear la pre-guía</button>}
          {mensaje?.tipo === 'error' && <Aviso tipo="error">{mensaje.texto}</Aviso>}
        </div>
      ) : (
        <div className="mt-2 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <p className="font-heading text-3xl font-semibold tabular text-gray-900" data-testid="pre-guia-numero">{preGuia.numeroCompleto}</p>
            {(() => { const x = m[preGuia.estado]; return <span className={`${chip} ${x.cls}`} data-testid="pre-guia-estado" data-estado={preGuia.estado}><x.Icono className="h-3.5 w-3.5" aria-hidden />{ETIQUETA_ESTADO_PRE_GUIA[preGuia.estado]}</span> })()}
          </div>
          <p className="text-sm text-gray-700">
            {preGuia.rutaNumero ? `Ruta ${preGuia.rutaNumero} · ${preGuia.placa ?? 'sin vehículo'} · ${preGuia.conductor ?? 'sin conductor'}` : 'Todavía sin ruta: el vehículo y el conductor salen de la ruta.'}
          </p>
          {faltaParaEnviar(preGuia) && preGuia.estado !== 'ENVIADA' && <p className={`${chip} ${CHIP_NEUTRO} whitespace-normal`} data-testid="pre-guia-falta">{faltaParaEnviar(preGuia)}</p>}
          {preGuia.estado === 'CANCELADA' && <p className="text-sm text-red-900">Cancelada: {preGuia.motivoCancelacion ?? 'sin motivo'}. El número {preGuia.numeroCompleto} queda libre: lo toma la siguiente pre-guía, así la serie no tiene huecos.</p>}
          <p className="text-sm text-gray-600">La pre-guía no existe ante SUNAT: al enviar la guía, Nubefact la genera con este mismo número.</p>
          <div className="flex flex-wrap gap-2">
            {preGuia.estado !== 'CANCELADA' && <a href={`/wms/salidas/${salidaId}/pre-guia`} target="_blank" rel="noopener noreferrer" className="btn-secondary" data-testid="imprimir-pre-guia"><Printer className="h-5 w-5" aria-hidden />Imprimir la pre-guía</a>}
            {puedeGestionar && (preGuia.estado === 'PRE_GUIA' || preGuia.estado === 'LISTA_PARA_ENVIAR') && !cancelando && <button type="button" className="btn-secondary" onClick={() => { setCancelando(true); setMotivo('') }} data-testid="cancelar-pre-guia">Cancelar la pre-guía</button>}
          </div>
          {cancelando && (
            <div className="space-y-2" data-testid="form-cancelar-pre-guia">
              <label htmlFor="motivo-pre-guia" className="etiqueta">¿Por qué se cancela la pre-guía?</label>
              <input id="motivo-pre-guia" className="campo" value={motivo} onChange={(e) => setMotivo(e.target.value)} data-testid="motivo-pre-guia" />
              <p className="text-sm text-gray-700">El número queda libre y lo toma la siguiente pre-guía. A quien factura le llega el aviso «NO factures» con ese número.</p>
              <div className="flex gap-2">
                <button type="button" className="btn-primary btn-sm" disabled={pendiente || !motivo.trim()} onClick={() => ejecutar(() => cancelarPreGuiaAccion(salidaId, motivo), { alExito: () => { setCancelando(false); router.refresh() } })} data-testid="cancelar-pre-guia-confirmar">Cancelar la pre-guía</button>
                <button type="button" className="btn-secondary btn-sm" onClick={() => setCancelando(false)}>Volver</button>
              </div>
              {mensaje?.tipo === 'error' && <Aviso tipo="error">{mensaje.texto}</Aviso>}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
