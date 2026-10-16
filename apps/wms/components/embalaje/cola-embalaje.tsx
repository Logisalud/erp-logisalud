import Link from 'next/link'
import { Box, ChevronRight, PackageCheck } from 'lucide-react'
import type { EmbalajeResumen } from '@/domain/embalaje'
import { CHIP_AVISO, CHIP_OK } from '../estilos-opcion'

/** Los pedidos conformes: primero los que faltan por embalar. */
export function ColaEmbalaje({ pedidos }: { pedidos: EmbalajeResumen[] }) {
  if (pedidos.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white px-6 py-14 text-center" data-testid="cola-embalaje-vacia">
        <Box className="mx-auto h-10 w-10 text-gray-400" aria-hidden />
        <p className="mt-3 font-medium text-gray-900">No hay pedidos por embalar</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-gray-600">Aparecen cuando todo el pedido tiene la conformidad.</p>
      </div>
    )
  }
  return (
    <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="cola-embalaje">
      {pedidos.map((p) => (
        <li key={p.salidaId}>
          <Link href={`/embalaje/${p.salidaId}`} className="block min-h-16 rounded-xl border border-gray-200 bg-white p-4 hover:border-gray-300 hover:shadow-sm active:bg-gray-50" data-testid="pedido-embalaje">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="tabular font-heading text-base font-semibold tracking-wide text-gray-900">{p.pedidoNumero ?? p.salidaNumero}</p>
                <p className="truncate text-sm text-gray-700">{p.cliente ?? 'Sin cliente'}</p>
              </div>
              <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-gray-400" aria-hidden />
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-gray-700">
              <span className="tabular">{p.salidaNumero} · {p.unidades.toLocaleString('es-PE')} u</span>
              {p.bultos > 0
                ? <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${CHIP_OK}`}><PackageCheck className="h-3.5 w-3.5" aria-hidden />Embalado · {p.bultos} {p.bultos === 1 ? 'bulto' : 'bultos'}</span>
                : <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${CHIP_AVISO}`}><Box className="h-3.5 w-3.5" aria-hidden />Por embalar</span>}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  )
}
