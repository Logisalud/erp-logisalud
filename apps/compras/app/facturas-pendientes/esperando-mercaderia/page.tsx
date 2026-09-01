import { Encabezado } from '@/components/nav'
import { Money } from '@/components/money'
import { listarFacturasEsperandoMercaderia } from '@/services/facturas-pendientes'

export const dynamic = 'force-dynamic'

/**
 * Vista informativa (Carta de Simplicidad regla 4: nunca una pantalla en
 * blanco, pero tampoco un botón que no tiene nada real que hacer todavía)
 * — nada que decidir acá, solo saber qué está esperando. En cuanto Almacén
 * registre la recepción que falta, la fila desaparece sola (pasó a
 * conciliada o a excepción).
 */
export default async function FacturasEsperandoMercaderia({
  searchParams,
}: { searchParams: { registrada?: string } }) {
  let filas: Awaited<ReturnType<typeof listarFacturasEsperandoMercaderia>> = []
  let error: string | null = null
  try {
    filas = await listarFacturasEsperandoMercaderia()
  } catch (e) {
    error = e instanceof Error ? e.message : 'No pudimos cargar la información.'
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Encabezado titulo="Esperando mercadería" atras={{ href: '/facturas-pendientes', texto: 'Facturas por conciliar' }} />
      {searchParams.registrada ? (
        <p className="card mb-4 border-logisalud-green text-sm text-gray-700">
          Factura registrada — todavía no hay mercadería recibida que la respalde. En cuanto Almacén
          registre la recepción, se concilia sola.
        </p>
      ) : null}

      {error ? (
        <div className="card border-red-200 bg-red-50 text-sm text-red-800">No pudimos cargar la información. Intenta nuevamente.</div>
      ) : filas.length === 0 ? (
        <p className="card text-sm text-gray-600">No hay ninguna factura esperando mercadería ahora mismo.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
                <th className="px-3 py-2 font-medium">Orden</th>
                <th className="px-3 py-2 font-medium">Proveedor</th>
                <th className="px-3 py-2 font-medium">N° de factura</th>
                <th className="px-3 py-2 font-medium">Fecha de factura</th>
                <th className="px-3 py-2 text-right font-medium">Total</th>
                <th className="px-3 py-2 font-medium">Registrada</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.id} className="border-b border-gray-100 last:border-0">
                  <td className="px-3 py-2 font-medium">{f.oc?.codigo ?? '—'}</td>
                  <td className="px-3 py-2">{f.oc?.proveedor?.razon_social ?? '—'}</td>
                  <td className="px-3 py-2">{f.numero_factura ?? '—'}</td>
                  <td className="px-3 py-2">{f.fecha_factura ?? '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{f.total != null ? <Money valor={f.total} /> : '—'}</td>
                  <td className="px-3 py-2 text-gray-500">{f.created_at.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
