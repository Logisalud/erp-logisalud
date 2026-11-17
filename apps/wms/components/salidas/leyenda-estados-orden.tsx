import { ChevronDown, Info } from 'lucide-react'
import { ESTADOS_ORDEN, ETIQUETA_ESTADO_ORDEN, QUIEN_ESTADO_ORDEN, SIGNIFICADO_ESTADO_ORDEN, type EstadoOrden } from '@/domain/estado-orden'
import { ChipEstadoVisual } from './chip-estado-orden'

const CAMINO = ESTADOS_ORDEN.filter((e) => e !== 'NO_ENTREGADA' && e !== 'CANCELADA')
const LATERALES: EstadoOrden[] = ['NO_ENTREGADA', 'CANCELADA']

function Fila({ e, actual }: { e: EstadoOrden; actual?: EstadoOrden }) {
  const esActual = actual === e
  return (
    <li className={`grid gap-1 px-3 py-2.5 sm:grid-cols-[11.5rem_minmax(0,1fr)] sm:gap-4 ${esActual ? 'bg-green-50' : ''} ${e === 'LISTA' ? 'border-l-2 border-green-600' : 'border-l-2 border-transparent'}`} data-testid={`leyenda-${e}`} aria-current={esActual ? 'true' : undefined}>
      <div className="pt-0.5"><ChipEstadoVisual estado={e} etiqueta={ETIQUETA_ESTADO_ORDEN[e]} /></div>
      <div className="min-w-0 text-sm text-gray-800">
        <p>{SIGNIFICADO_ESTADO_ORDEN[e]}</p>
        {QUIEN_ESTADO_ORDEN[e] !== 'Terminada' && <p className="mt-0.5 text-xs text-gray-600">Sigue con: {QUIEN_ESTADO_ORDEN[e]}</p>}
        {e === 'LISTA' && <p className="mt-0.5 text-xs font-medium text-green-900">Aquí se descarga la Orden de Salida, con su guía asignada.</p>}
      </div>
    </li>
  )
}

/**
 * La leyenda de los estados de la Orden de Salida: qué significa cada uno y quién lo hace avanzar. Va al pie de la tabla de Salidas (abierta) y en el detalle de cada orden
 * (cerrada, con el estado de esa orden resaltado). Es un `<details>`: funciona con teclado y lector de pantalla, sin JavaScript.
 */
export function LeyendaEstadosOrden({ abierta = true, actual, titulo = 'Qué significa cada estado' }: { abierta?: boolean; actual?: EstadoOrden; titulo?: string }) {
  return (
    <details open={abierta} className="group rounded-lg border border-gray-200 bg-white" data-testid="leyenda-estados">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 rounded-lg px-4 py-3 font-medium text-gray-900 marker:hidden hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/60 [&::-webkit-details-marker]:hidden">
        <Info className="h-5 w-5 shrink-0 text-gray-600" aria-hidden />
        <span className="flex-1">{titulo}</span>
        <ChevronDown className="h-5 w-5 shrink-0 text-gray-500 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden />
      </summary>
      <div className="border-t border-gray-100 pb-2">
        <p className="px-4 pt-3 text-xs font-medium uppercase tracking-wide text-gray-600">El camino de una orden</p>
        <ol className="mt-1 divide-y divide-gray-100">{CAMINO.map((e) => <Fila key={e} e={e} actual={actual} />)}</ol>
        <p className="px-4 pt-3 text-xs font-medium uppercase tracking-wide text-gray-600">Si algo no sale como se esperaba</p>
        <ul className="mt-1 divide-y divide-gray-100">{LATERALES.map((e) => <Fila key={e} e={e} actual={actual} />)}</ul>
      </div>
    </details>
  )
}
