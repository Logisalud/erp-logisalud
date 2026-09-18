import Link from 'next/link'
import { Encabezado } from '@/components/nav'
import { Money } from '@/components/money'
import { buscarOrdenesFacturables } from '@/services/facturas-elegibles'

export const dynamic = 'force-dynamic'

/**
 * Registrar factura de SERVICIO — paso 1: elegir la Orden de Servicio.
 *
 * Desde el rediseño de recepción (2026-09-18) esta pantalla atiende SOLO
 * servicios. En compras la factura ya no la registra Contabilidad: Almacén
 * la sube junto con la guía, en la misma recepción, y de ahí nace la
 * obligación con todo calculado.
 *
 * Servicios no tiene recepción de mercadería —no hay nada que contar ni
 * ningún Charlie que suba nada— así que ahí la factura la sigue registrando
 * Contabilidad, necesariamente. Por eso la pantalla no se eliminó: se
 * filtró. Eliminarla habría dejado a Servicios sin forma de facturar.
 */
export default async function RegistrarFacturaBuscar({
  searchParams,
}: { searchParams: { q?: string; tipo?: string } }) {
  // Forzado: ya no hay rama de compra que elegir.
  const tipo = 'servicio' as const

  let filas: Awaited<ReturnType<typeof buscarOrdenesFacturables>> = []
  let error: string | null = null
  try {
    filas = await buscarOrdenesFacturables({ busqueda: searchParams.q, tipo })
  } catch (e) {
    error = e instanceof Error ? e.message : 'No pudimos cargar la información.'
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <Encabezado titulo="Registrar factura de servicio" atras={{ href: '/', texto: 'Compras y Pagos' }} />
      <p className="-mt-4 mb-4 text-sm text-gray-600">
        Busca la Orden de Servicio ya aprobada y vincúlala con su factura.
      </p>

      <form className="card mb-4 grid gap-3 sm:grid-cols-3" method="get">
        <div className="sm:col-span-2">
          <input
            type="search" name="q" defaultValue={searchParams.q ?? ''}
            placeholder="Número de orden, proveedor o RUC…"
            className="min-h-12 w-full rounded-md border border-gray-300 px-3"
          />
        </div>
        <button type="submit" className="btn-secondary">Buscar</button>
      </form>

      {error ? (
        <div className="card border-red-200 bg-red-50 text-sm text-red-800">
          No pudimos cargar la información. Intenta nuevamente.
        </div>
      ) : filas.length === 0 ? (
        <p className="card text-sm text-gray-600">
          {searchParams.q || tipo
            ? 'No encontramos órdenes elegibles con esos filtros.'
            : 'No hay órdenes esperando factura ahora mismo — una recepción conforme o una OS aprobada aparecen aquí apenas estén listas.'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
                <th className="px-3 py-2 font-medium">N° de orden</th>
                <th className="px-3 py-2 font-medium">Fecha</th>
                <th className="px-3 py-2 font-medium">Proveedor</th>
                <th className="px-3 py-2 font-medium">RUC</th>
                <th className="px-3 py-2 font-medium">Resumen</th>
                <th className="px-3 py-2 text-right font-medium">Total orden</th>
                <th className="px-3 py-2 text-right font-medium">Facturado</th>
                <th className="px-3 py-2 text-right font-medium">Saldo</th>
                <th className="px-3 py-2 font-medium">Estado</th>
                <th className="px-3 py-2 font-medium">Acción</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={`${f.tipo}-${f.id}`} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="px-3 py-2 font-medium">{f.ordenCodigo}</td>
                  <td className="px-3 py-2">{f.fecha}</td>
                  <td className="px-3 py-2">{f.proveedor}</td>
                  <td className="px-3 py-2">{f.ruc ?? '—'}</td>
                  <td className="px-3 py-2 max-w-[220px] truncate">{f.resumen}</td>
                  <td className="px-3 py-2 text-right tabular-nums"><Money valor={f.totalOrden} moneda={f.moneda} /></td>
                  <td className="px-3 py-2 text-right tabular-nums"><Money valor={f.montoFacturado} moneda={f.moneda} /></td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums"><Money valor={f.saldoDisponible} moneda={f.moneda} /></td>
                  <td className={`px-3 py-2 ${f.estado.startsWith('Factura adjunta') ? 'font-medium text-amber-700' : 'text-gray-600'}`}>
                    {f.estado}
                  </td>
                  <td className="px-3 py-2">
                    <Link href={f.hrefRegistro} className="btn-secondary whitespace-nowrap">
                      Seleccionar orden
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
