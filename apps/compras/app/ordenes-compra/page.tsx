import Link from 'next/link'
import { Encabezado } from '@/components/nav'
import { Money } from '@/components/money'
import { listarOC } from '@/services/ordenes-compra'
import { ETIQUETA_ESTADO } from '@/domain/orden-compra'

export const dynamic = 'force-dynamic'

export default async function OrdenesCompra() {
  const ordenes = await listarOC()

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Encabezado titulo="Órdenes de compra" />

      <Link href="/ordenes-compra/nueva" className="btn-primary mb-5 w-full sm:w-auto">
        Nueva orden
      </Link>

      {ordenes.length === 0 ? (
        <p className="card text-sm text-gray-600">
          Todavía no hay órdenes de compra.
        </p>
      ) : (
        <ul className="space-y-2">
          {ordenes.map((oc) => (
            <li key={oc.id}>
              <Link href={`/ordenes-compra/${oc.id}`} className="card block transition hover:shadow-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium">{oc.codigo}</span>
                  <Money valor={oc.total} moneda={oc.moneda} />
                </div>
                <p className="mt-0.5 text-sm text-gray-600">
                  {oc.proveedor?.razon_social ?? 'proveedor no legible'} ·{' '}
                  {ETIQUETA_ESTADO[oc.estado]} · {oc.fecha_emision}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
