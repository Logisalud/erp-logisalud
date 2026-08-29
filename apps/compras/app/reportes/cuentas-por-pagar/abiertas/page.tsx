import { Encabezado } from '@/components/nav'
import { Money } from '@/components/money'
import { obtenerObligacionesAbiertas } from '@/services/reportes-cuentas-por-pagar-detalle'
import { listarProveedores } from '@/services/proveedores'
import { ETIQUETA_ESTADO } from '@/domain/obligacion'
import { BUCKETS_ANTIGUEDAD, ETIQUETA_BUCKET, ETIQUETA_ORIGEN, type BucketAntiguedad } from '@/domain/reportes'

export const dynamic = 'force-dynamic'

export default async function ReporteObligacionesAbiertas({
  searchParams,
}: { searchParams: { proveedorId?: string; bucket?: string; moneda?: string } }) {
  const bucket = (BUCKETS_ANTIGUEDAD as readonly string[]).includes(searchParams.bucket ?? '')
    ? (searchParams.bucket as BucketAntiguedad)
    : undefined

  const [filas, proveedores] = await Promise.all([
    obtenerObligacionesAbiertas({
      proveedorId: searchParams.proveedorId || undefined,
      bucket,
      moneda: searchParams.moneda || undefined,
    }),
    listarProveedores(),
  ])

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <Encabezado titulo="Obligaciones abiertas" atras={{ href: '/reportes', texto: 'Ver reportes' }} />

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
          <span className="text-gray-600">Antigüedad</span>
          <select name="bucket" defaultValue={searchParams.bucket ?? ''} className="mt-1 min-h-12 w-full rounded-md border border-gray-300 bg-white px-3">
            <option value="">Todas</option>
            {BUCKETS_ANTIGUEDAD.map((b) => (
              <option key={b} value={b}>{ETIQUETA_BUCKET[b]}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-gray-600">Moneda</span>
          <select name="moneda" defaultValue={searchParams.moneda ?? ''} className="mt-1 min-h-12 w-full rounded-md border border-gray-300 bg-white px-3">
            <option value="">Todas</option>
            <option value="PEN">PEN</option>
            <option value="USD">USD</option>
          </select>
        </label>
        <button type="submit" className="btn-secondary self-end">Filtrar</button>
      </form>

      {filas.length === 0 ? (
        <p className="card text-sm text-gray-600">No hay obligaciones abiertas para este filtro.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
                <th className="px-3 py-2 font-medium">Código</th>
                <th className="px-3 py-2 font-medium">Origen</th>
                <th className="px-3 py-2 font-medium">A quién</th>
                <th className="px-3 py-2 font-medium">N° factura</th>
                <th className="px-3 py-2 font-medium">Estado</th>
                <th className="px-3 py-2 font-medium">Vence</th>
                <th className="px-3 py-2 text-right font-medium">Antigüedad</th>
                <th className="px-3 py-2 text-right font-medium">Neto a pagar</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.id} className="border-b border-gray-100 last:border-0">
                  <td className="px-3 py-2">{f.codigo}</td>
                  <td className="px-3 py-2">{ETIQUETA_ORIGEN[f.origen]}</td>
                  <td className="px-3 py-2">{f.quien}</td>
                  <td className="px-3 py-2">{f.numeroFactura ?? '—'}</td>
                  <td className="px-3 py-2">{ETIQUETA_ESTADO[f.estado]}</td>
                  <td className="px-3 py-2">{f.fechaVencimiento ?? '—'}</td>
                  <td className="px-3 py-2 text-right">{ETIQUETA_BUCKET[f.bucket]}</td>
                  <td className="px-3 py-2 text-right tabular-nums"><Money valor={f.netoAPagar} moneda={f.moneda} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
