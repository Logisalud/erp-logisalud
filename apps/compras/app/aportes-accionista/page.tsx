import Link from 'next/link'
import { perfilActual } from '@logisalud/auth/server'
import { Encabezado } from '@/components/nav'
import { Money } from '@/components/money'
import { listarAportes, puedeRegistrarAporte, puedeVerAportes } from '@/services/aportes-accionista'
import { totalesPorMoneda } from '@/domain/aporte-accionista'

export const dynamic = 'force-dynamic'

/**
 * Aportes de accionista — gastos que el accionista pagó de su bolsillo y NO
 * reclama como reembolso.
 *
 * Esta pantalla NO vive dentro de Cuentas por Pagar ni linkea hacia ahí, a
 * propósito: un aporte no es una deuda de la empresa y no tiene que aparecer
 * en ningún lugar donde alguien busque qué pagar.
 */
export default async function AportesAccionista() {
  const perfil = await perfilActual()
  if (!puedeVerAportes(perfil)) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <Encabezado titulo="Aportes de accionista" atras={{ href: '/', texto: 'Compras y Pagos' }} />
        <p className="card text-sm text-gray-600">Esta pantalla es de Gerencia y Contabilidad.</p>
      </main>
    )
  }

  const puedeRegistrar = puedeRegistrarAporte(perfil)
  const aportes = await listarAportes()
  const totales = totalesPorMoneda(aportes)

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <Encabezado titulo="Aportes de accionista" atras={{ href: '/', texto: 'Compras y Pagos' }} />

      <p className="mb-4 text-sm text-gray-600">
        Gastos del negocio pagados del bolsillo del accionista, sin reembolso. Son un registro
        informativo para que Contabilidad los asiente como aporte de capital —{' '}
        <strong>no generan ninguna deuda de la empresa</strong> y no aparecen en Cuentas por
        Pagar ni en ninguna propuesta de pago.
      </p>

      <div className="mb-5 flex flex-wrap gap-2">
        {puedeRegistrar ? (
          <Link href="/aportes-accionista/nuevo" className="btn-primary w-full sm:w-auto">
            Registrar aporte
          </Link>
        ) : null}
        <Link href="/reportes/aportes-accionista" className="btn-secondary w-full sm:w-auto">
          Reporte por categoría
        </Link>
      </div>

      <section className="card mb-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Total aportado
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

      {aportes.length === 0 ? (
        <p className="card text-sm text-gray-600">Todavía no hay ningún aporte registrado.</p>
      ) : (
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
                {puedeRegistrar ? <th className="px-3 py-2 font-medium" /> : null}
              </tr>
            </thead>
            <tbody>
              {aportes.map((a) => (
                <tr key={a.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="px-3 py-2 whitespace-nowrap font-medium">{a.codigo}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-gray-600">{a.fecha}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{a.categoria}</td>
                  <td className="px-3 py-2 max-w-[280px]">
                    <span className="block truncate" title={a.descripcion}>{a.descripcion}</span>
                    {a.editado_en ? (
                      <span className="block text-xs text-gray-500">
                        Editado por {a.editadoPor ?? 'alguien del ERP'}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <Money valor={a.monto} moneda={a.moneda} />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-gray-600">
                    {a.registradoPor ?? '—'}
                  </td>
                  {puedeRegistrar ? (
                    <td className="px-3 py-2 whitespace-nowrap">
                      <Link
                        href={`/aportes-accionista/${a.id}/editar`}
                        className="text-logisalud-teal underline"
                      >
                        Editar
                      </Link>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
