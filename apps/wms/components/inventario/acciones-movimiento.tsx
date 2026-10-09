'use client'

import { useState } from 'react'
import { ArrowRight, Ban, Check, CheckCircle2, Hand, PackageCheck, RotateCcw, TriangleAlert, UserCheck } from 'lucide-react'
import {
  anularMovimientoAccion, autorizarMovimientoAccion, ejecutarMovimientoAccion, resolverMovimientoAccion, revisarMovimientoAccion,
} from '@/app/acciones-inventario'
import type { AccionesOrden, LineaOrdenMovimiento, OrdenMovimiento, RevisionLinea } from '@/domain/inventario'
import { useAccion } from '../usar-accion'
import { Aviso } from '../entradas/aviso'

const SI_OK = 'border-green-700 bg-green-50 text-green-900'
const SI_DIF = 'border-amber-600 bg-amber-50 text-amber-900'
const SIN_MARCAR = 'border-gray-300 bg-white text-gray-800'

type Decision = { resultado: 'COINCIDE' | 'DIFERENCIA'; nota: string }

/** Los pasos de un movimiento: cada persona solo ve el que le toca (la base de datos vuelve a comprobarlo). */
export function AccionesMovimiento({ orden, acciones }: { orden: OrdenMovimiento; acciones: AccionesOrden }) {
  const { pendiente, mensaje, ejecutar } = useAccion()
  const [panel, setPanel] = useState<'anular' | null>(null)
  const [texto, setTexto] = useState('')
  const [decisiones, setDecisiones] = useState<Record<string, Decision>>({})
  const [resolviendo, setResolviendo] = useState<string | null>(null)
  const cerrar = () => { setPanel(null); setTexto(''); setResolviendo(null) }

  const porVerificar = orden.lineas.filter((l) => l.verificacion === 'PENDIENTE')
  const abiertas = orden.lineas.filter((l) => l.verificacion === 'CON_DIFERENCIA')
  const decididas = porVerificar.filter((l) => decisiones[l.id]).length
  const faltaNota = porVerificar.some((l) => decisiones[l.id]?.resultado === 'DIFERENCIA' && !decisiones[l.id].nota.trim())
  const listo = porVerificar.length > 0 && decididas === porVerificar.length && !faltaNota
  const conDif = porVerificar.filter((l) => decisiones[l.id]?.resultado === 'DIFERENCIA').length
  const decidir = (id: string, d: Partial<Decision>) => setDecisiones((p) => ({ ...p, [id]: { ...(p[id] ?? { resultado: 'COINCIDE', nota: '' }), ...d } }))
  const todoCoincide = () => setDecisiones(Object.fromEntries(porVerificar.map((l) => [l.id, { resultado: 'COINCIDE', nota: '' } satisfies Decision])))

  const enviarRevision = () => {
    const revision: RevisionLinea[] = porVerificar.map((l) => ({ lineaId: l.id, resultado: decisiones[l.id].resultado, nota: decisiones[l.id].nota.trim() || undefined }))
    ejecutar(() => revisarMovimientoAccion(orden.id, revision), { exito: conDif === 0 ? 'Movimiento confirmado: el stock ya está en su nuevo lugar.' : `Confirmadas ${porVerificar.length - conDif}. ${conDif === 1 ? 'La línea con diferencia queda abierta' : `Las ${conDif} líneas con diferencia quedan abiertas`} y avisamos al Jefe de Almacén.` })
  }

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
          <p className="text-sm text-gray-700">Mueve exactamente los lotes y las cantidades indicados. Cuando termines, marca que ya lo moviste: otra persona lo verifica.</p>
          <button type="button" className="btn-primary" disabled={pendiente} onClick={() => ejecutar(() => ejecutarMovimientoAccion(orden.id), { exito: 'Listo: ahora lo verifica otra persona.' })} data-testid="mov-ejecutar"><Hand className="h-5 w-5" aria-hidden />Ya lo moví</button>
        </div>
      )}
      {orden.estado === 'EJECUTADO' && !acciones.verificar && (
        <Aviso tipo="info" testid="mov-espera-verificador">Espera a otra persona. {acciones.motivoNoVerifica ?? 'Solo el personal de almacén verifica.'} Quien prepara o mueve no verifica su propio movimiento.</Aviso>
      )}

      {acciones.verificar && (
        <div className="space-y-3" data-testid="mov-revision">
          <p className="text-sm text-gray-700">Comprueba cada línea en el destino: producto, lote y cantidad. Si algo no coincide, márcalo: solo esa línea queda abierta y las demás se confirman.</p>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-gray-900" data-testid="mov-progreso">{decididas} de {porVerificar.length} revisadas</p>
            <button type="button" className="btn-secondary btn-sm" onClick={todoCoincide} data-testid="mov-todo-coincide"><CheckCircle2 className="h-4 w-4" aria-hidden />Todo coincide</button>
          </div>
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200" data-testid="mov-revision-lineas">
            {porVerificar.map((l) => <LineaRevision key={l.id} l={l} d={decisiones[l.id]} alDecidir={(d) => decidir(l.id, d)} />)}
          </ul>
          {/* Acción principal fija abajo en teléfono */}
          <div className="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 -mx-4 border-t border-gray-200 bg-white px-4 py-3 md:static md:mx-0 md:border-0 md:p-0">
            <button type="button" className="btn-primary w-full md:w-auto" disabled={pendiente || !listo} onClick={enviarRevision} data-testid="mov-enviar-revision">
              <Check className="h-5 w-5" aria-hidden />
              {!listo ? (faltaNota ? 'Cuenta qué no coincide' : `Revisa las ${porVerificar.length - decididas} líneas que faltan`) : conDif === 0 ? 'Confirmar el movimiento' : `Confirmar ${porVerificar.length - conDif} y reportar ${conDif}`}
            </button>
          </div>
        </div>
      )}

      {abiertas.length > 0 && (
        <div className="space-y-2" data-testid="mov-dif-abierta">
          <Aviso tipo="atencion">{abiertas.length === 1 ? 'Hay una línea con diferencia abierta.' : `Hay ${abiertas.length} líneas con diferencia abierta.`} Las demás ya se confirmaron.</Aviso>
          <ul className="divide-y divide-gray-100 rounded-lg border border-amber-300 bg-amber-50">
            {abiertas.map((l) => (
              <li key={l.id} className="space-y-2 p-3" data-testid="mov-linea-abierta">
                <p className="font-medium text-gray-900">{l.producto} <span className="tabular font-normal text-gray-700">· lote {l.lote} · {l.cantidad} u</span></p>
                <p className="text-sm text-gray-800">{l.notaDiferencia}</p>
                {acciones.resolver && (resolviendo !== l.id ? (
                  <button type="button" className="btn-primary btn-sm" onClick={() => { setResolviendo(l.id); setTexto('') }} data-testid="mov-abrir-resolver"><RotateCcw className="h-4 w-4" aria-hidden />Resolver esta línea</button>
                ) : (
                  <div className="space-y-2">
                    <label htmlFor={`res-${l.id}`} className="etiqueta">¿Qué encontraste y qué decides?</label>
                    <textarea id={`res-${l.id}`} rows={2} className="campo !min-h-20 py-2" value={texto} onChange={(e) => setTexto(e.target.value)} data-testid="mov-res-texto" />
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="btn-primary btn-sm" disabled={pendiente || !texto.trim()} onClick={() => ejecutar(() => resolverMovimientoAccion(l.id, 'REINTENTAR', texto), { exito: 'Se vuelve a mover esa línea y la verifica otra persona.', alExito: cerrar })} data-testid="mov-reintentar">Volver a mover</button>
                      <button type="button" className="btn-secondary btn-sm" disabled={pendiente || !texto.trim()} onClick={() => ejecutar(() => resolverMovimientoAccion(l.id, 'ANULAR', texto), { exito: 'Línea anulada.', alExito: cerrar })} data-testid="mov-anular-dif">Anular la línea</button>
                      <button type="button" className="btn-secondary btn-sm" onClick={cerrar}>Cancelar</button>
                    </div>
                  </div>
                ))}
              </li>
            ))}
          </ul>
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

function LineaRevision({ l, d, alDecidir }: { l: LineaOrdenMovimiento; d: Decision | undefined; alDecidir: (d: Partial<Decision>) => void }) {
  return (
    <li className="space-y-2 p-3" data-testid="mov-revision-linea">
      <div>
        <p className="font-medium text-gray-900">{l.producto}</p>
        <p className="tabular text-sm text-gray-700">Lote {l.lote} · {l.cantidad} u</p>
        <p className="tabular mt-0.5 flex items-center gap-1.5 text-sm text-gray-800">{l.desde}<ArrowRight className="h-4 w-4 text-gray-500" aria-hidden />{l.hacia}</p>
      </div>
      <div className="grid grid-cols-2 gap-2" role="group" aria-label={`Resultado de ${l.producto}`}>
        <button type="button" aria-pressed={d?.resultado === 'COINCIDE'} onClick={() => alDecidir({ resultado: 'COINCIDE', nota: '' })} data-testid="linea-coincide"
          className={`inline-flex min-h-12 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border-2 px-2 font-medium ${d?.resultado === 'COINCIDE' ? SI_OK : SIN_MARCAR}`}>
          <Check className="h-5 w-5" aria-hidden />Coincide
        </button>
        <button type="button" aria-pressed={d?.resultado === 'DIFERENCIA'} onClick={() => alDecidir({ resultado: 'DIFERENCIA' })} data-testid="linea-diferencia"
          className={`inline-flex min-h-12 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border-2 px-2 font-medium ${d?.resultado === 'DIFERENCIA' ? SI_DIF : SIN_MARCAR}`}>
          <TriangleAlert className="h-5 w-5" aria-hidden />No coincide
        </button>
      </div>
      {d?.resultado === 'DIFERENCIA' && (
        <div>
          <label htmlFor={`dif-${l.id}`} className="etiqueta">¿Qué no coincide?</label>
          <textarea id={`dif-${l.id}`} rows={2} className="campo !min-h-20 py-2" value={d.nota} onChange={(e) => alDecidir({ nota: e.target.value })} placeholder="Producto, lote, cantidad o ubicación" data-testid="linea-dif-nota" />
          <p className="mt-1 text-xs text-gray-700">No cambies cantidades para que el sistema «cuadre».</p>
        </div>
      )}
    </li>
  )
}
