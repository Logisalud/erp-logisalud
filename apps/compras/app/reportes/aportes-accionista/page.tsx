import { perfilActual } from '@logisalud/auth/server'
import { Encabezado } from '@/components/nav'
import { Money } from '@/components/money'
import { listarAportes, puedeVerAportes } from '@/services/aportes-accionista'
import { totalesPorCategoria, totalesPorMoneda } from '@/domain/aporte-accionista'

export const dynamic = 'force-dynamic'

/**
 * El reporte para Contabilidad: cuánto puso el accionista, en qué, y en qué
 * período — que es lo que Mariela necesita para asentarlo como aporte de
 * capital. Agrupado por categoría, con el detalle debajo y export a Excel.
 */
export default async function ReporteAportes({
  searchParams,
}: {
  searchParams: { desde?: string; hasta?: string }
}) {
  if (!puedeVerAportes(await perfilActual())) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <Encabezado titulo="Aportes de accionista" atras={{ href: '/reportes', texto: 'Reportes' }} />
        <p className="card text-sm text-gray-600">Este reporte es de Gerencia y Contabilidad.</p>
      </main>
    )
  }

  const desde = searchParams.desde || undefined
  const hasta = searchParams.hasta || undefined
  const aportes = await listarAportes({ desde, hasta })
  const porCategoria = totalesPorCategoria(
    aportes.map((a) => ({ categoria: a.categoria, moneda: a.moneda, monto: a.monto }))
  )
  const totales = totalesPorMoneda(aportes)
  const qs = new URLSearchParams()
  if (desde) qs.set('desde', desde)
  if (hasta) qs.set('hasta', hasta)
  const querystring = qs.toString() ? `?${qs.toString()}` : ''

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <Encabezado titulo="Aportes de accionista" atras={{ href: '/reportes', texto: 'Reportes' }} />

      <p className="mb-4 text-sm text-gray-600">
        Gastos del negocio pagados por el accionista sin reembolso. No son deuda de la empresa y
        no aparecen en Cuentas por Pagar — este reporte existe para asentarlos como aporte de
        capital. Lo anulado no se incluye.
      </p>

      <form method="get" className="card mb-4 flex flex-wrap items-end gap-3">
        <label className="block text-sm">
          <span className="text-gray-600">Desde</span>
          <input
            type="date" name="desde" defaultValue={desde}
            className="mt-1 min-h-12 rounded-md border border-gray-300 px-3"
          />
        </label>
        <label className="block text-sm">
          <span className="text-gray-600">Hasta</span>
          <input
            type="date" name="hasta" defaultValue={hasta}
            className="mt-1 min-h-12 rounded-md border border-gray-300 px-3"
          />
        </label>
        <button type="submit" className="btn-secondary">Filtrar</button>
        <a href={`/reportes/aportes-accionista/descargar${querystring}`} className="btn-secondary">
          Exportar a Excel
        </a>
      </form>

      <section className="card mb-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Total del período
        </p>
        <p className="font-heading mt-0.5 flex flex-wrap gap-x-4 text-xl">
          {totales.length === 0
            ? '—'
            : totales.map((t) => (
                <span key={t.moneda} className="tabular-nums">
                  <Money valor={t.monto} moneda={t.moneda} />
                </span>
              ))}
        </p>
      </section>

      {porCategoria.length === 0 ? (
        <p className="card text-sm text-gray-600">No hay aportes en este período.</p>
      ) : (
        <>
          <div className="mb-6 overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
                  <th className="px-3 py-2 font-medium">Categoría</th>
                  <th className="px-3 py-2 text-right font-medium">Registros</th>
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {porCategoria.map((c) => (
                  <tr key={c.categoria} className="border-b border-gray-100 last:border-0">
                    <td className="px-3 py-2">{c.categoria}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-600">{c.cantidad}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {c.totales.map((t) => (
                        <span key={t.moneda} className="ml-3">
                          <Money valor={t.monto} moneda={t.moneda} />
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 className="font-heading mb-2 text-lg">Detalle</h2>
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
                  <th className="px-3 py-2 font-medium">Código</th>
                  <th className="px-3 py-2 font-medium">Fecha</th>
                  <th className="px-3 py-2 font-medium">Categoría</th>
                  <th className="px-3 py-2 font-medium">Descripción</th>
                  <th className="px-3 py-2 text-right font-medium">Monto</th>
                  <th className="px-3 py-2 font-medium">Registró</th>
                </tr>
              </thead>
              <tbody>
                {aportes.map((a) => (
                  <tr key={a.id} className="border-b border-gray-100 last:border-0">
                    <td className="px-3 py-2 whitespace-nowrap font-medium">{a.codigo}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-gray-600">{a.fecha}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{a.categoria}</td>
                    <td className="px-3 py-2 max-w-[280px] truncate" title={a.descripcion}>
                      {a.descripcion}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <Money valor={a.monto} moneda={a.moneda} />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-gray-600">
                      {a.registradoPor ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  )
}
