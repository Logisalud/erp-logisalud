'use client'

import { useState } from 'react'
import { anularGuiaAccion } from '@/app/acciones-picking'
import { CASOS_ANULACION, MENSAJE_CASO_1_2_DESPUES_DE_SALIR, MENSAJE_CASO_3_ANTES_DE_SALIR, TEXTO_BAJA_EN_NUBEFACT, TEXTO_BAJA_PENDIENTE, type CasoAnulacion } from '@/domain/guia-electronica'
import { useAccion } from '../usar-accion'
import { Aviso } from '../entradas/aviso'

/** Anular una guía: se elige qué se equivocó (tres casos) y se cuenta por qué. Una guía nunca se borra ni se edita. */
export function AnularGuia({ guiaId, salioYa = false, alAnular }: { guiaId: string; salioYa?: boolean; alAnular: (texto: string) => void }) {
  const { pendiente, mensaje, ejecutar, limpiar } = useAccion()
  const [abierto, setAbierto] = useState(false)
  const [caso, setCaso] = useState<CasoAnulacion | null>(null)
  const [motivo, setMotivo] = useState('')
  const elegido = CASOS_ANULACION.find((c) => c.caso === caso)

  if (!abierto) return <button type="button" className="btn-secondary btn-sm" onClick={() => setAbierto(true)} data-testid="anular-gre">Anular la guía</button>
  return (
    <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3" data-testid="anular-guia">
      <fieldset className="space-y-2">
        <legend className="etiqueta">¿Qué se equivocó?</legend>
        {CASOS_ANULACION.map((c) => {
          const noVale = salioYa ? c.caso !== 3 : c.caso === 3
          return (
            <label key={c.caso} className={`flex items-start gap-3 rounded-md border p-3 ${noVale ? 'cursor-not-allowed border-gray-200 bg-gray-50 text-gray-500' : caso === c.caso ? 'cursor-pointer border-gray-900 bg-white' : 'cursor-pointer border-gray-200 bg-white'}`}>
              <input type="radio" name="caso-anulacion" className="mt-1 h-4 w-4" checked={caso === c.caso} disabled={noVale} onChange={() => setCaso(c.caso)} data-testid={`caso-${c.caso}`} />
              <span><strong className={`block ${noVale ? 'text-gray-600' : 'text-gray-900'}`}>{c.titulo}</strong><span className="text-sm text-gray-700">{c.detalle}</span>{noVale && <span className="mt-1 block text-sm text-gray-700">{salioYa ? MENSAJE_CASO_1_2_DESPUES_DE_SALIR : MENSAJE_CASO_3_ANTES_DE_SALIR}.</span>}</span>
            </label>
          )
        })}
      </fieldset>
      {elegido && <p className="text-sm text-gray-800" data-testid="que-sigue-anulacion"><strong>Qué pasa después:</strong> {elegido.sigue}</p>}
      {caso === 3 && <Aviso tipo="atencion" testid="aviso-caso-3">{TEXTO_BAJA_EN_NUBEFACT}</Aviso>}
      <div>
        <label htmlFor="motivo-anular" className="etiqueta">¿Por qué se anula?</label>
        <input id="motivo-anular" className="campo" value={motivo} onChange={(e) => setMotivo(e.target.value)} data-testid="motivo-anular-gre" />
      </div>
      {mensaje?.tipo === 'error' && <Aviso tipo="error">{mensaje.texto}</Aviso>}
      <div className="flex gap-2">
        <button type="button" className="btn-primary btn-sm" disabled={pendiente || caso === null || !motivo.trim()} data-testid="confirmar-anular-gre"
          onClick={() => ejecutar(() => anularGuiaAccion(guiaId, caso!, motivo), {
            alExito: (r) => {
              const x = r as unknown as { caso: CasoAnulacion; conformidadReabierta: boolean; bajaSunat: string; pedidos: string }
              setAbierto(false); setMotivo(''); setCaso(null)
              alAnular(`Guía anulada. ${x.conformidadReabierta ? 'La conformidad se reabrió y el stock volvió de Despacho a su ubicación. Siguiente: otra persona confirma de nuevo en Conformidad y después emites otra guía.' : (x.caso === 3 ? 'El stock no se tocó: la orden ya había salido. Quedó «guía anulada, falta guía vigente». Siguiente: emite la guía nueva. Si la mercadería vuelve al almacén, entra como devolución.' : 'La Orden de Salida no cambió. Siguiente: corrige el dato y emite otra guía.')} ${x.pedidos === 'ENVIADO' ? 'Pedidos fue avisado: Contabilidad decide si se anula la factura o hay nota de crédito (el WMS no la toca).' : 'El aviso a Pedidos quedó en la bandeja y se reintenta.'}${x.bajaSunat === 'PENDIENTE' ? ` ${TEXTO_BAJA_PENDIENTE}` : ''} ${x.caso === 3 ? '' : 'Mientras no haya guía nueva, la orden no se puede cargar ni sacar.'}`)
            },
          })}>Anular la guía</button>
        <button type="button" className="btn-secondary btn-sm" onClick={() => { setAbierto(false); limpiar() }}>Cancelar</button>
      </div>
    </div>
  )
}
