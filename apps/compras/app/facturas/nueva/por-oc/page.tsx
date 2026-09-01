import Link from 'next/link'
import { Encabezado } from '@/components/nav'
import { listarOCsParaFacturarDirecto } from '@/services/facturas-pendientes'

export const dynamic = 'force-dynamic'

const ETIQUETA_ESTADO: Record<string, string> = {
  confirmada: 'Confirmada — sin recibir todavía',
  parcialmente_recibida: 'Recibida en parte',
  recibida_completa: 'Recibida completa',
}

/**
 * Segundo camino de "Registrar una factura": a diferencia del buscador
 * normal (busca una recepción YA conforme), este entra por la Orden de
 * Compra directamente — porque una factura puede llegar ANTES que la
 * mercadería, o cubrir varias recepciones a la vez. El sistema decide solo
 * si concilia ahora o queda esperando (ver services/facturas-pendientes.ts).
 */
export default async function RegistrarFacturaPorOC() {
  let filas: Awaited<ReturnType<typeof listarOCsParaFacturarDirecto>> = []
  let error: string | null = null
  try {
    filas = await listarOCsParaFacturarDirecto()
  } catch (e) {
    error = e instanceof Error ? e.message : 'No pudimos cargar la información.'
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Encabezado titulo="Factura contra una orden de compra" atras={{ href: '/facturas/nueva', texto: 'Registrar una factura' }} />
      <p className="-mt-4 mb-4 text-sm text-gray-600">
        Usa este camino cuando la factura llega antes que la mercadería, o cuando cubre varias
        recepciones de la misma orden. Si todavía no hay saldo recibido que la respalde, queda
        esperando — apenas Almacén registre la recepción, se concilia sola.
      </p>

      {error ? (
        <div className="card border-red-200 bg-red-50 text-sm text-red-800">No pudimos cargar la información. Intenta nuevamente.</div>
      ) : filas.length === 0 ? (
        <p className="card text-sm text-gray-600">No hay órdenes de compra con saldo por facturar ahora mismo.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
                <th className="px-3 py-2 font-medium">N° de orden</th>
                <th className="px-3 py-2 font-medium">Proveedor</th>
                <th className="px-3 py-2 font-medium">RUC</th>
                <th className="px-3 py-2 font-medium">Estado</th>
                <th className="px-3 py-2 font-medium">Acción</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="px-3 py-2 font-medium">{f.codigo}</td>
                  <td className="px-3 py-2">{f.proveedor?.razon_social ?? '—'}</td>
                  <td className="px-3 py-2">{f.proveedor?.ruc ?? '—'}</td>
                  <td className="px-3 py-2 text-gray-600">{ETIQUETA_ESTADO[f.estado] ?? f.estado}</td>
                  <td className="px-3 py-2">
                    <Link href={`/facturas/nueva/registrar/${f.id}`} className="btn-secondary whitespace-nowrap">
                      Registrar factura
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
