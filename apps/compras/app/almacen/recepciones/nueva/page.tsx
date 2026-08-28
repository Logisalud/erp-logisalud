import Link from 'next/link'
import { Encabezado } from '@/components/nav'
import { listarOCsParaRecibir } from '@/services/recepciones'

export const dynamic = 'force-dynamic'

/** Paso 1: elegir contra qué OC se está recibiendo. */
export default async function ElegirOCParaRecibir() {
  const ordenes = await listarOCsParaRecibir()

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Encabezado titulo="Registrar recepción" atras={{ href: '/almacen', texto: 'Almacén' }} />

      <p className="mb-4 text-sm text-gray-600">
        Elegí la orden de compra de la que llegó la mercadería.
      </p>

      {ordenes.length === 0 ? (
        <p className="card text-sm text-gray-600">
          No hay ninguna orden de compra confirmada con saldo por recibir.
        </p>
      ) : (
        <ul className="space-y-2">
          {ordenes.map((oc) => (
            <li key={oc.id}>
              <Link
                href={`/almacen/recepciones/nueva/${oc.id}`}
                className="card block transition hover:shadow-sm"
              >
                <span className="font-medium">{oc.codigo}</span>
                <p className="mt-0.5 text-sm text-gray-600">
                  {oc.proveedor?.razon_social ?? 'proveedor no legible'} · {oc.items.length}{' '}
                  {oc.items.length === 1 ? 'producto pendiente' : 'productos pendientes'}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
