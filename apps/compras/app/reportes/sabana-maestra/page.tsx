import Link from 'next/link'
import { Encabezado } from '@/components/nav'
import { Money } from '@/components/money'
import { obtenerSabanaMaestra } from '@/services/reportes-sabana'
import { listarProveedores } from '@/services/proveedores'
import { ORIGENES_OBLIGACION, ETIQUETA_ORIGEN, ETIQUETA_ESTADO_PAGO_SABANA } from '@/domain/reportes'

export const dynamic = 'force-dynamic'

export default async function SabanaMaestra({
  searchParams,
}: { searchParams: { origen?: string; proveedorId?: string; desde?: string; hasta?: string } }) {
  const origen = (ORIGENES_OBLIGACION as readonly string[]).includes(searchParams.origen ?? '')
    ? (searchParams.origen as (typeof ORIGENES_OBLIGACION)[number])
    : undefined

  const filtros = {
    origen,
    proveedorId: searchParams.proveedorId || undefined,
    fechaDesde: searchParams.desde || undefined,
    fechaHasta: searchParams.hasta || undefined,
  }

  const [filas, proveedores] = await Promise.all([obtenerSabanaMaestra(filtros), listarProveedores()])
  const queryDescarga = new URLSearchParams(
    Object.entries(searchParams).filter(([, v]) => !!v) as [string, string][]
  ).toString()

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Encabezado titulo="Sábana maestra" atras={{ href: '/reportes', texto: 'Ver reportes' }} />
      <p className="mb-4 text-sm text-gray-600">
        Una fila por obligación, todos los campos — para análisis libre en Excel o Power BI. Los
        mismos filtros de acá se aplican al archivo descargado.
      </p>

      <form className="card mb-4 grid gap-3 sm:grid-cols-5" method="get">
        <label className="block text-sm">
          <span className="text-gray-600">Origen</span>
          <select name="origen" defaultValue={searchParams.origen ?? ''} className="mt-1 min-h-12 w-full rounded-md border border-gray-300 bg-white px-3">
            <option value="">Todos</option>
            {ORIGENES_OBLIGACION.map((o) => (
              <option key={o} value={o}>{ETIQUETA_ORIGEN[o]}</option>
            ))}
          </select>
        </label>
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
          <span className="text-gray-600">Registrada desde</span>
          <input type="date" name="desde" defaultValue={searchParams.desde ?? ''} className="mt-1 min-h-12 w-full rounded-md border border-gray-300 px-3" />
        </label>
        <label className="block text-sm">
          <span className="text-gray-600">hasta</span>
          <input type="date" name="hasta" defaultValue={searchParams.hasta ?? ''} className="mt-1 min-h-12 w-full rounded-md border border-gray-300 px-3" />
        </label>
        <button type="submit" className="btn-secondary self-end">Filtrar</button>
      </form>

      <Link
        href={`/reportes/sabana-maestra/descargar${queryDescarga ? `?${queryDescarga}` : ''}`}
        className="btn-primary mb-4 inline-block"
      >
        Descargar Excel
      </Link>

      {filas.length === 0 ? (
        <p className="card text-sm text-gray-600">No hay obligaciones para este filtro.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
                <th className="px-3 py-2 font-medium">Código</th>
                <th className="px-3 py-2 font-medium">Proveedor / beneficiario</th>
                <th className="px-3 py-2 font-medium">Origen</th>
                <th className="px-3 py-2 font-medium">Referencia</th>
                <th className="px-3 py-2 font-medium">N° factura</th>
                <th className="px-3 py-2 font-medium">Vence</th>
                <th className="px-3 py-2 text-right font-medium">Monto original</th>
                <th className="px-3 py-2 text-right font-medium">Pagado</th>
                <th className="px-3 py-2 text-right font-medium">Saldo</th>
                <th className="px-3 py-2 font-medium">Estado</th>
                <th className="px-3 py-2 font-medium">Área</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.id} className="border-b border-gray-100 last:border-0">
                  <td className="px-3 py-2">{f.codigo}</td>
                  <td className="px-3 py-2">{f.quien}</td>
                  <td className="px-3 py-2">{f.origenEtiqueta}</td>
                  <td className="px-3 py-2">{f.referencia ?? '—'}</td>
                  <td className="px-3 py-2">{f.numeroFactura ?? '—'}</td>
                  <td className="px-3 py-2">{f.fechaVencimiento ?? '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums"><Money valor={f.montoOriginal} moneda={f.moneda} /></td>
                  <td className="px-3 py-2 text-right tabular-nums"><Money valor={f.montoPagado} moneda={f.moneda} /></td>
                  <td className="px-3 py-2 text-right tabular-nums"><Money valor={f.saldoPendiente} moneda={f.moneda} /></td>
                  <td className="px-3 py-2">{ETIQUETA_ESTADO_PAGO_SABANA[f.estado]}</td>
                  <td className="px-3 py-2">{f.area ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
