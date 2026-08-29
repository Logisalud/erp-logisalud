import { Encabezado } from '@/components/nav'
import { Money } from '@/components/money'
import { obtenerAntiguedadSaldos } from '@/services/reportes-cuentas-por-pagar-detalle'
import { BUCKETS_ANTIGUEDAD, ETIQUETA_BUCKET } from '@/domain/reportes'

export const dynamic = 'force-dynamic'

export default async function ReporteAntiguedad() {
  const reporte = await obtenerAntiguedadSaldos()

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <Encabezado titulo="Antigüedad de saldos" atras={{ href: '/reportes', texto: 'Ver reportes' }} />

      {reporte.filas.length === 0 ? (
        <p className="card text-sm text-gray-600">No hay obligaciones abiertas.</p>
      ) : (
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
                      {f.porBucket[b] > 0 ? <Money valor={f.porBucket[b]} moneda={f.moneda} /> : '—'}
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
      )}
      <p className="mt-3 text-xs text-gray-500">
        Los totales mezclan monedas si hay obligaciones en PEN y USD para el mismo proveedor — cada
        fila de la tabla ya está separada por moneda.
      </p>
    </main>
  )
}
