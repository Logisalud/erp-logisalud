import Link from 'next/link'
import { Encabezado } from '@/components/nav'
import { Money } from '@/components/money'
import { obtenerAntiguedadSaldos } from '@/services/reportes-cuentas-por-pagar-detalle'
import { BUCKETS_ANTIGUEDAD, ETIQUETA_BUCKET } from '@/domain/reportes'
import { DescargarCSV } from './descargar-csv'

export const dynamic = 'force-dynamic'

export default async function ReporteAntiguedad({
  searchParams,
}: { searchParams: { q?: string; moneda?: string } }) {
  const reporte = await obtenerAntiguedadSaldos({ busqueda: searchParams.q, moneda: searchParams.moneda })

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <Encabezado titulo="Antigüedad de saldos" atras={{ href: '/reportes', texto: 'Ver reportes' }} />

      <form className="card mb-4 flex flex-wrap items-end gap-3" method="get">
        <label className="block flex-1 min-w-[200px] text-sm">
          <span className="text-gray-600">Proveedor o RUC</span>
          <input
            type="search"
            name="q"
            defaultValue={searchParams.q ?? ''}
            placeholder="Buscar por razón social o RUC"
            className="mt-1 min-h-12 w-full rounded-md border border-gray-300 px-3"
          />
        </label>
        {reporte.monedasDisponibles.length > 1 ? (
          <label className="block text-sm">
            <span className="text-gray-600">Moneda</span>
            <select name="moneda" defaultValue={searchParams.moneda ?? ''} className="mt-1 min-h-12 rounded-md border border-gray-300 bg-white px-3">
              <option value="">Todas</option>
              {reporte.monedasDisponibles.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </label>
        ) : null}
        <button type="submit" className="btn-secondary">Filtrar</button>
        {(searchParams.q || searchParams.moneda) ? (
          <Link href="/reportes/cuentas-por-pagar/antiguedad" className="text-sm text-gray-500 underline">
            Quitar filtros
          </Link>
        ) : null}
      </form>

      {reporte.filas.length === 0 ? (
        <p className="card text-sm text-gray-600">No hay obligaciones abiertas para este filtro.</p>
      ) : (
        <>
          <div className="mb-3 flex justify-end">
            <DescargarCSV filas={reporte.filas} totalesPorMoneda={reporte.totalesPorMoneda} />
          </div>
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
                  <th className="px-3 py-2 font-medium">Proveedor / beneficiario</th>
                  {BUCKETS_ANTIGUEDAD.map((b) => (
                    <th key={b} className="px-3 py-2 text-right font-medium">{ETIQUETA_BUCKET[b]}</th>
                  ))}
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {reporte.filas.map((f) => (
                  <tr key={f.clave} className="border-b border-gray-100 last:border-0">
                    <td className="px-3 py-2">{f.nombre}</td>
                    {BUCKETS_ANTIGUEDAD.map((b) => (
                      <td key={b} className="px-3 py-2 text-right tabular-nums">
                        {f.porBucket[b] > 0 ? (
                          <Link
                            href={`/reportes/cuentas-por-pagar/abiertas?bucket=${b}&moneda=${f.moneda}${f.proveedorId ? `&proveedorId=${f.proveedorId}` : ''}`}
                            className="text-logisalud-teal underline decoration-dotted hover:decoration-solid"
                          >
                            <Money valor={f.porBucket[b]} moneda={f.moneda} />
                          </Link>
                        ) : (
                          '—'
                        )}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right font-semibold tabular-nums"><Money valor={f.total} moneda={f.moneda} /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                {reporte.totalesPorMoneda.map((t) => (
                  <tr key={t.moneda} className="border-t-2 border-gray-300 font-semibold">
                    <td className="px-3 py-2">Total {t.moneda}</td>
                    {BUCKETS_ANTIGUEDAD.map((b) => (
                      <td key={b} className="px-3 py-2 text-right tabular-nums">
                        <Money valor={t.porBucket[b]} moneda={t.moneda} />
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right tabular-nums"><Money valor={t.total} moneda={t.moneda} /></td>
                  </tr>
                ))}
              </tfoot>
            </table>
          </div>
        </>
      )}
      <p className="mt-3 text-xs text-gray-500">
        Cada monto de la tabla ya está separado por moneda — nunca se suma PEN con USD en un mismo
        total. Tocá un monto para ver las obligaciones que lo componen.
      </p>
    </main>
  )
}
