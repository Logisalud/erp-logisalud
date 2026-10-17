import Link from 'next/link'
import { ChevronRight, Truck } from 'lucide-react'
import { ETIQUETA_ESTADO_CARGA, avanceCarga, type CargaResumen } from '@/domain/carga'
import { CHIP_AVISO, CHIP_OK } from '../estilos-opcion'

const fecha = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('es-PE', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })

export function ColaCarga({ rutas }: { rutas: CargaResumen[] }) {
  if (rutas.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white px-6 py-14 text-center" data-testid="cola-carga-vacia">
        <Truck className="mx-auto h-10 w-10 text-gray-400" aria-hidden />
        <p className="mt-3 font-medium text-gray-900">No hay rutas para cargar</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-gray-600">Aparecen cuando una ruta planificada tiene pedidos con salida.</p>
      </div>
    )
  }
  return (
    <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="cola-carga">
      {rutas.map((r) => (
        <li key={r.rutaId}>
          <Link href={`/carga/${r.rutaId}`} className="block min-h-16 rounded-xl border border-gray-200 bg-white p-4 hover:border-gray-300 hover:shadow-sm active:bg-gray-50" data-testid="ruta-carga">
            <div className="flex items-start justify-between gap-2">
              <div><p className="tabular font-heading text-base font-semibold tracking-wide text-gray-900">{r.rutaNumero}</p><p className="text-sm text-gray-700">{fecha(r.fecha)} · {r.placa ?? 'sin vehículo'} · {r.pedidos} {r.pedidos === 1 ? 'pedido' : 'pedidos'}</p></div>
              <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-gray-400" aria-hidden />
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${r.estado === 'EN_CARGA' ? CHIP_AVISO : CHIP_OK}`} data-testid="estado-carga">{ETIQUETA_ESTADO_CARGA[r.estado]}</span>
              <span className="flex items-center gap-2 text-xs text-gray-700"><span className="h-2 w-20 overflow-hidden rounded-full bg-gray-200" aria-hidden><span className="block h-full rounded-full bg-green-700" style={{ width: `${avanceCarga(r)}%` }} /></span><span className="tabular">{r.bultosCargados}/{r.bultosEsperados} bultos</span></span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  )
}
