'use client'

import { useState } from 'react'
import { Ban, CheckCircle2, Hand, PackageCheck, RotateCcw, TriangleAlert, UserCheck } from 'lucide-react'
import {
  anularMovimientoAccion, autorizarMovimientoAccion, confirmarMovimientoAccion, diferenciaMovimientoAccion, ejecutarMovimientoAccion, resolverMovimientoAccion,
} from '@/app/acciones-inventario'
import type { AccionesOrden, OrdenMovimiento } from '@/domain/inventario'
import { useAccion } from '../usar-accion'
import { Aviso } from '../entradas/aviso'

/** Los pasos de un movimiento: cada persona solo ve el que le toca (la base de datos vuelve a comprobarlo). */
export function AccionesMovimiento({ orden, acciones }: { orden: OrdenMovimiento; acciones: AccionesOrden }) {
  const { pendiente, mensaje, ejecutar } = useAccion()
  const [panel, setPanel] = useState<'diferencia' | 'resolver' | 'anular' | null>(null)
  const [texto, setTexto] = useState('')
  const cerrar = () => { setPanel(null); setTexto('') }

  return (
    <div className="space-y-3" data-testid="acciones-movimiento">
      {acciones.autorizar && (
        <div className="space-y-2">
          <p className="text-sm text-gray-700">Revisa lo que se va a mover y de dónde a dónde. Al autorizar, el personal de almacén puede moverlo.</p>
          <button type="button" className="btn-primary" disabled={pendiente} onClick={() => ejecutar(() => autorizarMovimientoAccion(orden.id), { exito: 'Movimiento autorizado.' })} data-testid="mov-autorizar"><UserCheck className="h-5 w-5" aria-hidden />Autorizar el movimiento</button>
        </div>
      )}
      {acciones.ejecutar && (
        <div className="space-y-2">
          <p className="text-sm text-gray-700">Mueve exactamente el lote y la cantidad indicados. Cuando termines, marca que ya lo moviste: otra persona lo verifica.</p>
          <button type="button" className="btn-primary" disabled={pendiente} onClick={() => ejecutar(() => ejecutarMovimientoAccion(orden.id), { exito: 'Listo: ahora lo verifica otra persona.' })} data-testid="mov-ejecutar"><Hand className="h-5 w-5" aria-hidden />Ya lo moví</button>
        </div>
      )}
      {orden.estado === 'EJECUTADO' && !acciones.verificar && (
        <Aviso tipo="info" testid="mov-espera-verificador">Espera a otra persona. {acciones.motivoNoVerifica ?? 'Solo el personal de almacén verifica.'} Quien prepara o mueve no verifica su propio movimiento.</Aviso>
      )}
      {acciones.verificar && panel !== 'diferencia' && (
        <div className="space-y-2">
          <p className="text-sm text-gray-700">Comprueba que el producto, el lote y la cantidad quedaron en el destino. Si todo está bien, confirma; si algo no coincide, no confirmes.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary" disabled={pendiente} onClick={() => ejecutar(() => confirmarMovimientoAccion(orden.id), { exito: 'Movimiento confirmado: el stock ya está en su nuevo lugar.' })} data-testid="mov-confirmar"><CheckCircle2 className="h-5 w-5" aria-hidden />Todo coincide: confirmar</button>
            <button type="button" className="btn-secondary" onClick={() => setPanel('diferencia')} data-testid="mov-abrir-diferencia"><TriangleAlert className="h-5 w-5" aria-hidden />Algo no coincide</button>
          </div>
        </div>
      )}
      {panel === 'diferencia' && (
        <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-4">
          <label htmlFor="mov-dif" className="etiqueta">¿Qué no coincide?</label>
          <textarea id="mov-dif" rows={2} className="campo !min-h-20 py-2" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Producto, lote, cantidad o ubicación" data-testid="mov-dif-texto" />
          <p className="text-xs text-gray-700">No cambies cantidades para que el sistema «cuadre». El movimiento queda abierto y avisamos al Jefe de Almacén.</p>
          <div className="flex gap-2"><button type="button" className="btn-primary btn-sm" disabled={pendiente || !texto.trim()} onClick={() => ejecutar(() => diferenciaMovimientoAccion(orden.id, texto), { exito: 'Diferencia registrada: avisamos al Jefe de Almacén.', alExito: cerrar })} data-testid="mov-registrar-dif">Registrar la diferencia</button><button type="button" className="btn-secondary btn-sm" onClick={cerrar}>Cancelar</button></div>
        </div>
      )}
      {acciones.resolver && (
        <div className="space-y-2">
          <Aviso tipo="atencion" testid="mov-dif-abierta">Hay una diferencia abierta: {orden.notaDiferencia}</Aviso>
          {panel !== 'resolver' ? <button type="button" className="btn-primary" onClick={() => setPanel('resolver')} data-testid="mov-abrir-resolver"><RotateCcw className="h-5 w-5" aria-hidden />Resolver la diferencia</button> : (
            <div className="space-y-2 rounded-lg border border-gray-200 p-4">
              <label htmlFor="mov-res" className="etiqueta">¿Qué encontraste y qué decides?</label>
              <textarea id="mov-res" rows={2} className="campo !min-h-20 py-2" value={texto} onChange={(e) => setTexto(e.target.value)} data-testid="mov-res-texto" />
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-primary btn-sm" disabled={pendiente || !texto.trim()} onClick={() => ejecutar(() => resolverMovimientoAccion(orden.id, 'REINTENTAR', texto), { exito: 'Se vuelve a mover y lo verifica otra persona.', alExito: cerrar })} data-testid="mov-reintentar">Volver a mover</button>
                <button type="button" className="btn-secondary btn-sm" disabled={pendiente || !texto.trim()} onClick={() => ejecutar(() => resolverMovimientoAccion(orden.id, 'ANULAR', texto), { exito: 'Movimiento anulado.', alExito: cerrar })} data-testid="mov-anular-dif">Anular el movimiento</button>
                <button type="button" className="btn-secondary btn-sm" onClick={cerrar}>Cancelar</button>
              </div>
            </div>
          )}
        </div>
      )}
      {acciones.anular && panel !== 'anular' && <button type="button" className="inline-flex min-h-10 items-center gap-1.5 rounded-md px-2 text-sm text-gray-700 hover:bg-gray-100" onClick={() => setPanel('anular')} data-testid="mov-abrir-anular"><Ban className="h-4 w-4" aria-hidden />Anular el movimiento…</button>}
      {panel === 'anular' && (
        <div className="space-y-2 rounded-lg border border-gray-200 p-4">
          <label htmlFor="mov-anu" className="etiqueta">Motivo</label>
          <input id="mov-anu" className="campo" value={texto} onChange={(e) => setTexto(e.target.value)} autoComplete="off" data-testid="mov-anu-texto" />
          <div className="flex gap-2"><button type="button" className="btn-primary btn-sm" disabled={pendiente || !texto.trim()} onClick={() => ejecutar(() => anularMovimientoAccion(orden.id, texto), { exito: 'Movimiento anulado.', alExito: cerrar })} data-testid="mov-confirmar-anular">Anular</button><button type="button" className="btn-secondary btn-sm" onClick={cerrar}>No anular</button></div>
        </div>
      )}
      {orden.estado === 'CONFIRMADO' && <Aviso tipo="ok" testid="mov-confirmado"><span className="flex items-center gap-1.5 font-medium"><PackageCheck className="h-4 w-4" aria-hidden />Movimiento confirmado</span>Verificó {orden.verificador}. El stock ya figura en su nuevo lugar.</Aviso>}
      {orden.estado === 'ANULADO' && <Aviso tipo="info" testid="mov-anulado">Anulado{orden.motivoAnulacion ? `: ${orden.motivoAnulacion}` : ''}. No movió stock.</Aviso>}
      {mensaje && <Aviso tipo={mensaje.tipo === 'ok' ? 'ok' : 'error'}>{mensaje.texto}</Aviso>}
    </div>
  )
}
