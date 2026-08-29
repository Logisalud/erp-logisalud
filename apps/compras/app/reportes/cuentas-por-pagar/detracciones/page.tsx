import { Encabezado } from '@/components/nav'
import { Money } from '@/components/money'
import { obtenerReporteDetracciones } from '@/services/reportes-cuentas-por-pagar-detalle'
import { ETIQUETA_ESTADO } from '@/domain/obligacion'

export const dynamic = 'force-dynamic'

/** SUNAT-facing, separado del aging general a propósito — Contabilidad lo usa para sustentar el fondo de detracciones, no para gestionar cobranza. */
export default async function ReporteDetracciones({
  searchParams,
}: { searchParams: { desde?: string; hasta?: string } }) {
  const filas = await obtenerReporteDetracciones({
    fechaDesde: searchParams.desde || undefined,
    fechaHasta: searchParams.hasta || undefined,
  })
  const totalDetraccionPorMoneda = sumarPorMoneda(filas.map((f) => ({ moneda: f.moneda, monto: f.montoDetraccion })))

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <Encabezado titulo="Detracciones" atras={{ href: '/reportes', texto: 'Ver reportes' }} />

      <form className="card mb-4 grid gap-3 sm:grid-cols-3" method="get">
        <label className="block text-sm">
          <span className="text-gray-600">Factura desde</span>
          <input type="date" name="desde" defaultValue={searchParams.desde ?? ''} className="mt-1 min-h-12 w-full rounded-md border border-gray-300 px-3" />
        </label>
        <label className="block text-sm">
          <span className="text-gray-600">hasta</span>
          <input type="date" name="hasta" defaultValue={searchParams.hasta ?? ''} className="mt-1 min-h-12 w-full rounded-md border border-gray-300 px-3" />
        </label>
        <button type="submit" className="btn-secondary self-end">Filtrar</button>
      </form>

      {totalDetraccionPorMoneda.length > 0 ? (
        <p className="mb-4 text-sm text-gray-600">
          Total detraído: {totalDetraccionPorMoneda.map((t) => (
            <span key={t.moneda} className="mr-3 font-medium"><Money valor={t.monto} moneda={t.moneda} /></span>
          ))}
        </p>
      ) : null}

      {filas.length === 0 ? (
        <p className="card text-sm text-gray-600">No hay obligaciones con detracción para este filtro.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
                <th className="px-3 py-2 font-medium">Código</th>
                <th className="px-3 py-2 font-medium">Proveedor</th>
                <th className="px-3 py-2 font-medium">N° factura</th>
                <th className="px-3 py-2 font-medium">Fecha factura</th>
                <th className="px-3 py-2 font-medium">Categoría (anexo SUNAT)</th>
                <th className="px-3 py-2 text-right font-medium">Base imponible</th>
                <th className="px-3 py-2 text-right font-medium">Detracción</th>
                <th className="px-3 py-2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.id} className="border-b border-gray-100 last:border-0">
                  <td className="px-3 py-2">{f.codigo}</td>
                  <td className="px-3 py-2">{f.quien}</td>
                  <td className="px-3 py-2">{f.numeroFactura ?? '—'}</td>
                  <td className="px-3 py-2">{f.fechaFactura ?? '—'}</td>
                  <td className="px-3 py-2">
                    {f.categoria ? `${f.categoria}${f.anexoSunat ? ` (${f.anexoSunat})` : ''}` : '—'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums"><Money valor={f.baseImponible} moneda={f.moneda} /></td>
                  <td className="px-3 py-2 text-right tabular-nums"><Money valor={f.montoDetraccion} moneda={f.moneda} /></td>
                  <td className="px-3 py-2">{ETIQUETA_ESTADO[f.estado]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}

function sumarPorMoneda(filas: readonly { moneda: string; monto: number }[]) {
  const mapa = new Map<string, number>()
  for (const f of filas) mapa.set(f.moneda, (mapa.get(f.moneda) ?? 0) + f.monto)
  return [...mapa.entries()].map(([moneda, monto]) => ({ moneda, monto }))
}
