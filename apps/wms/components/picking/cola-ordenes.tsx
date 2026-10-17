import Link from 'next/link'
import { ChevronRight, ClipboardCheck, PackageCheck } from 'lucide-react'
import { avancePicking, type OrdenPickingResumen } from '@/domain/despacho'

const Barra = ({ o }: { o: OrdenPickingResumen }) => (
  <div className="flex items-center gap-2" aria-label={`${o.pickeadas} de ${o.lineas} líneas pickeadas`}>
    <span className="h-2 w-24 overflow-hidden rounded-full bg-gray-200" aria-hidden><span className="block h-full rounded-full bg-green-700" style={{ width: `${avancePicking(o)}%` }} /></span>
    <span className="tabular text-xs text-gray-700">{o.pickeadas}/{o.lineas}</span>
  </div>
)

/** La cola de trabajo: picking (qué falta pickear) o conformidad (qué falta verificar). */
export function ColaOrdenes({ ordenes, modo }: { ordenes: OrdenPickingResumen[]; modo: 'picking' | 'conformidad' }) {
  const base = modo === 'picking' ? '/picking' : '/conformidad'
  const Icono = modo === 'picking' ? ClipboardCheck : PackageCheck
  if (ordenes.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white px-6 py-14 text-center" data-testid={`cola-${modo}-vacia`}>
        <Icono className="mx-auto h-10 w-10 text-gray-400" aria-hidden />
        <p className="mt-3 font-medium text-gray-900">{modo === 'picking' ? 'No hay picking pendiente' : 'No hay nada esperando conformidad'}</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-gray-600">{modo === 'picking' ? 'Las órdenes aparecen cuando el Jefe de Transporte genera el picking de una salida.' : 'Aparecen cuando alguien termina de pickear una línea.'}</p>
      </div>
    )
  }
  return (
    <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid={`cola-${modo}`}>
      {ordenes.map((o) => (
        <li key={o.id}>
          <Link href={`${base}/${o.id}`} className="block min-h-16 rounded-xl border border-gray-200 bg-white p-4 hover:border-gray-300 hover:shadow-sm active:bg-gray-50" data-testid="orden-cola">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="tabular font-heading text-base font-semibold tracking-wide text-gray-900">{o.pedidoNumero ?? o.salidaNumero}</p>
                <p className="truncate text-sm text-gray-700">{o.cliente ?? 'Sin cliente'}</p>
              </div>
              <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-gray-400" aria-hidden />
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-gray-700">
              <span className="tabular">{o.numero} · {o.unidades.toLocaleString('es-PE')} u</span>
              {modo === 'picking' ? <Barra o={o} /> : <span className="tabular text-xs">{o.conformes}/{o.lineas} conformes{o.observadas > 0 ? ` · ${o.observadas} observadas` : ''}</span>}
            </div>
            {o.discrepancias > 0 && <p className="mt-2 text-xs font-medium text-amber-900">{o.discrepancias} {o.discrepancias === 1 ? 'línea con discrepancia' : 'líneas con discrepancia'}</p>}
          </Link>
        </li>
      ))}
    </ul>
  )
}
