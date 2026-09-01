import Link from 'next/link'
import { Encabezado } from '@/components/nav'
import { Money } from '@/components/money'
import { buscarOrdenesFacturables } from '@/services/facturas-elegibles'

export const dynamic = 'force-dynamic'

/**
 * Registrar una factura — paso 1: buscar y elegir la orden aprobada.
 *
 * Al elegir una fila, el paso 2 es la pantalla real que YA registra la
 * factura de ese tipo de orden con sus reglas de negocio reales (conciliación
 * de 3 vías para compra, la ficha de servicio para OS) — no un formulario
 * paralelo que reinvente esa lógica. Cada fila ya muestra el resumen de la
 * orden (proveedor, moneda, saldo) antes de entrar.
 */
export default async function RegistrarFacturaBuscar({
  searchParams,
}: { searchParams: { q?: string; tipo?: string } }) {
  const tipo = searchParams.tipo === 'compra' || searchParams.tipo === 'servicio' ? searchParams.tipo : undefined

  let filas: Awaited<ReturnType<typeof buscarOrdenesFacturables>> = []
  let error: string | null = null
  try {
    filas = await buscarOrdenesFacturables({ busqueda: searchParams.q, tipo })
  } catch (e) {
    error = e instanceof Error ? e.message : 'No pudimos cargar la información.'
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <Encabezado titulo="Registrar una factura" atras={{ href: '/', texto: 'Compras y Pagos' }} />
      <p className="-mt-4 mb-4 text-sm text-gray-600">
        Busca la orden de compra o de servicio ya aprobada y vincúlala con su factura.
      </p>
      <p className="-mt-2 mb-4 text-sm">
        ¿La factura llegó antes que la mercadería, o cubre varias recepciones de la misma orden?{' '}
        <Link href="/facturas/nueva/por-oc" className="text-logisalud-teal underline">
          Regístrala contra la orden de compra directamente.
        </Link>
      </p>

      <form className="card mb-4 grid gap-3 sm:grid-cols-4" method="get">
        <div className="sm:col-span-2">
          <input
            type="search" name="q" defaultValue={searchParams.q ?? ''}
            placeholder="Número de orden, proveedor o RUC…"
            className="min-h-12 w-full rounded-md border border-gray-300 px-3"
          />
        </div>
        <select name="tipo" defaultValue={searchParams.tipo ?? ''} className="min-h-12 w-full rounded-md border border-gray-300 bg-white px-3">
          <option value="">Todas</option>
          <option value="compra">Órdenes de compra</option>
          <option value="servicio">Órdenes de servicio</option>
        </select>
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
            : 'No hay órdenes esperando factura ahora mismo — una recepción conforme o una OS aprobada aparecen acá apenas estén listas.'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
                <th className="px-3 py-2 font-medium">Tipo</th>
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
                  <td className="px-3 py-2">{f.tipo === 'compra' ? 'OC' : 'OS'}</td>
                  <td className="px-3 py-2 font-medium">{f.ordenCodigo}</td>
                  <td className="px-3 py-2">{f.fecha}</td>
                  <td className="px-3 py-2">{f.proveedor}</td>
                  <td className="px-3 py-2">{f.ruc ?? '—'}</td>
                  <td className="px-3 py-2 max-w-[220px] truncate">{f.resumen}</td>
                  <td className="px-3 py-2 text-right tabular-nums"><Money valor={f.totalOrden} moneda={f.moneda} /></td>
                  <td className="px-3 py-2 text-right tabular-nums"><Money valor={f.montoFacturado} moneda={f.moneda} /></td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums"><Money valor={f.saldoDisponible} moneda={f.moneda} /></td>
                  <td className="px-3 py-2 text-gray-600">{f.estado}</td>
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
