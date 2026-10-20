'use client'

import Link from 'next/link'
import { Undo2 } from 'lucide-react'
import { ejecutarDevolucionPickingAccion, verificarDevolucionPickingAccion } from '@/app/acciones-picking'
import type { DevolucionPickingVista } from '@/domain/despacho'
import type { Rol } from '@/domain/tipos'
import { useAccion } from '../usar-accion'
import { Aviso } from '../entradas/aviso'

const ESTADO = { POR_DEVOLVER: 'Por devolver', DEVUELTA: 'Devuelta: falta verificar', VERIFICADA: 'Verificada' } as const

/** Lo picado que un cambio o la cancelación del pedido dejó sin pedido: el auxiliar lo devuelve a su ubicación y OTRA persona lo verifica (movimiento verificado). */
export function DevolverPicado({ salidaId, devoluciones, roles, cancelacionPendiente, motivo }: { salidaId: string; devoluciones: DevolucionPickingVista[]; roles: readonly Rol[]; cancelacionPendiente?: boolean; motivo?: string }) {
  const { pendiente, mensaje, ejecutar } = useAccion()
  if (devoluciones.length === 0) return null
  const porDevolver = devoluciones.some((d) => d.estado === 'POR_DEVOLVER')
  const porVerificar = devoluciones.some((d) => d.estado === 'DEVUELTA')
  const puede = roles.some((r) => r === 'auxiliar' || r === 'jefe_almacen' || r === 'jefe_transporte')
  const puedeVerificar = roles.some((r) => r === 'auxiliar' || r === 'jefe_almacen')
  return (
    <section aria-labelledby="h-devolver" className="space-y-3 rounded-lg border border-amber-300 bg-amber-50/40 p-4" data-testid="devolver-picado">
      <h2 id="h-devolver" className="flex items-center gap-2 font-heading text-xl font-medium tracking-wide text-gray-900"><Undo2 className="h-6 w-6" aria-hidden />Lo picado vuelve a su ubicación</h2>
      <Aviso tipo="atencion" testid="devolver-explica">
        {cancelacionPendiente ? <p>El pedido se canceló en Pedidos{motivo ? `: ${motivo}` : ''}. La orden se cancela cuando lo picado vuelva a su ubicación y otra persona lo verifique.</p>
          : <p>El pedido cambió en Pedidos y parte de lo picado ya no se pide. Hasta que vuelva a su ubicación y otra persona lo verifique, la orden no avanza (ni guía, ni embalaje, ni carga).</p>}
      </Aviso>
      {mensaje?.tipo === 'error' && <Aviso tipo="error">{mensaje.texto}</Aviso>}
      <div className="overflow-x-auto rounded-md border border-gray-200 bg-white">
        <table className="w-full text-sm" data-testid="tabla-devoluciones">
          <caption className="sr-only">Unidades picadas por devolver</caption>
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-gray-700"><tr><th scope="col" className="px-3 py-2 font-medium">Producto y lote</th><th scope="col" className="px-3 py-2 text-right font-medium">Unidades</th><th scope="col" className="px-3 py-2 font-medium">De → a</th><th scope="col" className="px-3 py-2 font-medium">Estado</th></tr></thead>
          <tbody className="divide-y divide-gray-100">
            {devoluciones.map((d) => (
              <tr key={d.id} data-testid="fila-devolucion">
                <td className="px-3 py-2"><strong className="block text-gray-900">{d.producto}</strong><span className="tabular text-gray-600">Lote {d.lote}</span></td>
                <td className="tabular px-3 py-2 text-right font-medium">{d.cantidad.toLocaleString('es-PE')}</td>
                <td className="tabular px-3 py-2 text-gray-800">{d.estadoReserva === 'EN_STAGING' ? `${d.desde} → ${d.hasta}` : `Vuelve a ${d.hasta}`}{d.movimientoNumero && <Link href={`/movimientos/${d.movimientoId}`} className="ml-2 underline">{d.movimientoNumero}</Link>}</td>
                <td className="px-3 py-2 text-gray-800">{ESTADO[d.estado]}{d.devueltaPor && <span className="block text-xs text-gray-600">Devolvió: {d.devueltaPor}</span>}{d.verificadaPor && <span className="block text-xs text-gray-600">Verificó: {d.verificadaPor}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-3">
        {porDevolver && puede && <button type="button" className="btn-primary" disabled={pendiente} onClick={() => ejecutar(() => ejecutarDevolucionPickingAccion(salidaId), { exito: 'Registrado. Ahora otra persona verifica que lo picado volvió a su ubicación.' })} data-testid="devolver-picado-ejecutar">{pendiente ? 'Guardando…' : 'Ya devolví lo picado'}</button>}
        {porVerificar && !porDevolver && puedeVerificar && <button type="button" className="btn-primary" disabled={pendiente} onClick={() => ejecutar(() => verificarDevolucionPickingAccion(salidaId), { exito: 'Verificado: lo picado volvió a su ubicación.' })} data-testid="devolver-picado-verificar">{pendiente ? 'Guardando…' : 'Verifico que volvió a su ubicación'}</button>}
        {!puede && <p className="text-sm text-gray-700">Lo devuelve el auxiliar de almacén y lo verifica otra persona.</p>}
      </div>
      {mensaje?.tipo === 'ok' && <Aviso tipo="ok">{mensaje.texto}</Aviso>}
    </section>
  )
}
