import { Encabezado } from '@/components/nav'
import { Money } from '@/components/money'
import { obtenerHistorialPagos } from '@/services/reportes-cuentas-por-pagar-detalle'
import { listarProveedores } from '@/services/proveedores'

export const dynamic = 'force-dynamic'

export default async function ReporteHistorialPagos({
  searchParams,
}: { searchParams: { proveedorId?: string; desde?: string; hasta?: string } }) {
  const [filas, proveedores] = await Promise.all([
    obtenerHistorialPagos({
      proveedorId: searchParams.proveedorId || undefined,
      fechaDesde: searchParams.desde || undefined,
      fechaHasta: searchParams.hasta || undefined,
    }),
    listarProveedores(),
  ])

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <Encabezado titulo="Historial de pagos" atras={{ href: '/reportes', texto: 'Ver reportes' }} />

      <form className="card mb-4 grid gap-3 sm:grid-cols-4" method="get">
        <label className="block text-sm">
          <span className="text-gray-600">Proveedor</span>
          <select name="proveedorId" defaultValue={searchParams.proveedorId ?? ''} className="mt-1 min-h-12 w-full rounded-md border border-gray-300 bg-white px-3">
            <option value="">Todos</option>
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>{p.razon_social}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-gray-600">Pagado desde</span>
          <input type="date" name="desde" defaultValue={searchParams.desde ?? ''} className="mt-1 min-h-12 w-full rounded-md border border-gray-300 px-3" />
        </label>
        <label className="block text-sm">
          <span className="text-gray-600">hasta</span>
          <input type="date" name="hasta" defaultValue={searchParams.hasta ?? ''} className="mt-1 min-h-12 w-full rounded-md border border-gray-300 px-3" />
        </label>
        <button type="submit" className="btn-secondary self-end">Filtrar</button>
      </form>

      {filas.length === 0 ? (
        <p className="card text-sm text-gray-600">No hay pagos para este filtro.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
                <th className="px-3 py-2 font-medium">Fecha de pago</th>
                <th className="px-3 py-2 font-medium">Obligación</th>
                <th className="px-3 py-2 font-medium">A quién</th>
                <th className="px-3 py-2 font-medium">N° voucher</th>
                <th className="px-3 py-2 text-right font-medium">Monto aplicado</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f, i) => (
                <tr key={`${f.pagoId}-${f.obligacionId}-${i}`} className="border-b border-gray-100 last:border-0">
                  <td className="px-3 py-2">{f.fechaPago ?? '—'}</td>
                  <td className="px-3 py-2">{f.obligacionCodigo}</td>
                  <td className="px-3 py-2">{f.quien}</td>
                  <td className="px-3 py-2">{f.numeroVoucher ?? '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums"><Money valor={f.montoAplicado} moneda={f.moneda} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
