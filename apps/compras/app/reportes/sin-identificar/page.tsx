import Link from 'next/link'
import { Encabezado } from '@/components/nav'
import { Money } from '@/components/money'
import { listarObligacionesSinIdentificar } from '@/services/reporte-sin-identificar'
import {
  CATEGORIA_BACKLOG, esUsoFueraDelBacklog, RAZON_SOCIAL_SIN_IDENTIFICAR,
  totalPendienteDeIdentificar,
} from '@/domain/proveedor-sin-identificar'
import { ETIQUETA_ESTADO } from '@/domain/obligacion'

export const dynamic = 'force-dynamic'

/**
 * Control del proveedor comodín del backlog pre-ERP.
 *
 * Dos lecturas en una pantalla: qué le queda a Sebas por investigar, y si
 * alguien usó el comodín fuera del backlog — que es el riesgo real de tener
 * un proveedor "SIN IDENTIFICAR" disponible en el buscador de cualquier pago
 * directo.
 */
export default async function ReporteSinIdentificar() {
  const filas = await listarObligacionesSinIdentificar()
  const totales = totalPendienteDeIdentificar(filas)
  const fueraDelBacklog = filas.filter((f) => esUsoFueraDelBacklog(f.categoria))

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <Encabezado
        titulo="Pagos sin proveedor identificado"
        atras={{ href: '/reportes', texto: 'Reportes' }}
      />

      <p className="mb-4 text-sm text-gray-600">
        Todo lo cargado contra <strong>{RAZON_SOCIAL_SIN_IDENTIFICAR}</strong>, el proveedor
        comodín del backlog anterior al ERP. Son pagos reales cuyo destinatario todavía no se
        pudo determinar — quedan acá hasta que se identifiquen.
      </p>

      {filas.length === 0 ? (
        <p className="card text-sm text-gray-600">
          No hay ningún pago cargado contra el proveedor sin identificar.
        </p>
      ) : (
        <>
          <section className="card mb-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Pendiente de identificar
            </p>
            <p className="font-heading mt-0.5 flex flex-wrap gap-x-6 text-xl">
              {totales.map((t) => (
                <span key={t.moneda} className="tabular-nums">
                  <Money valor={t.monto} moneda={t.moneda} />
                </span>
              ))}
            </p>
            <p className="mt-1 text-sm text-gray-600">
              {filas.length} {filas.length === 1 ? 'pago' : 'pagos'} en total.
            </p>
          </section>

          {/* El riesgo real del comodín: está disponible en el buscador de
              CUALQUIER pago directo, no solo del backlog. Si aparece con
              otra categoría, alguien lo eligió en vez de cargar el proveedor
              de verdad — y conviene corregirlo antes de que se pierda el
              rastro. */}
          {fueraDelBacklog.length > 0 ? (
            <div className="mb-4 rounded-md border-2 border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <p className="font-semibold">
                {fueraDelBacklog.length}{' '}
                {fueraDelBacklog.length === 1
                  ? 'pago usa el comodín fuera del backlog'
                  : 'pagos usan el comodín fuera del backlog'}
              </p>
              <p className="mt-1">
                El comodín es solo para la categoría &ldquo;{CATEGORIA_BACKLOG}&rdquo;. Estos
                tienen otra categoría: {fueraDelBacklog.map((f) => f.codigo).join(', ')}. Conviene
                corregirlos con el proveedor real mientras se sepa cuál era.
              </p>
            </div>
          ) : null}

          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
                  <th className="px-3 py-2 font-medium">Código</th>
                  <th className="px-3 py-2 font-medium">Fecha</th>
                  <th className="px-3 py-2 font-medium">N° factura</th>
                  <th className="px-3 py-2 font-medium">Categoría</th>
                  <th className="px-3 py-2 font-medium">Concepto</th>
                  <th className="px-3 py-2 text-right font-medium">Monto</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => {
                  const fuera = esUsoFueraDelBacklog(f.categoria)
                  return (
                    <tr key={f.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                      <td className="px-3 py-2 whitespace-nowrap">
                        <Link
                          href={`/cuentas-por-pagar/${f.id}`}
                          className="font-medium text-logisalud-teal underline"
                        >
                          {f.codigo}
                        </Link>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-gray-600">
                        {f.fecha_factura ?? '—'}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-gray-600">
                        {f.numero_factura ?? '—'}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className={fuera ? 'font-medium text-amber-800' : 'text-gray-600'}>
                          {f.categoria ?? '—'}
                        </span>
                      </td>
                      <td
                        className="px-3 py-2 max-w-[260px] truncate"
                        title={f.observaciones ?? undefined}
                      >
                        {f.observaciones ?? '—'}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        <Money valor={f.monto} moneda={f.moneda} />
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-gray-600">
                        {ETIQUETA_ESTADO[f.estado]}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  )
}
