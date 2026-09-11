import Link from 'next/link'
import { perfilActual } from '@logisalud/auth/server'
import { Encabezado } from '@/components/nav'
import { Money } from '@/components/money'
import { puedeVerPropuestas, type MontoPorMoneda } from '@/domain/propuesta-permisos'
import { listarPropuestas } from '@/services/propuestas'
import { ETIQUETA_ESTADO_PROPUESTA } from '@/domain/propuesta'

export const dynamic = 'force-dynamic'

export default async function Propuestas() {
  // Pieza I: el panel es de Contabilidad, Tesorería y admin. Tesorería ve
  // pero no aprueba — su momento es ejecutar el pago, ya aprobado.
  if (!puedeVerPropuestas(await perfilActual())) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        <Encabezado titulo="Propuestas de pago" atras={{ href: '/cuentas-por-pagar', texto: 'Cuentas por Pagar' }} />
        <p className="card text-sm text-gray-600">
          Esta pantalla es de Contabilidad y Tesorería. Si necesitas ver una propuesta, pedísela a
          alguno de ellos.
        </p>
      </main>
    )
  }

  const propuestas = await listarPropuestas()

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Encabezado titulo="Propuestas de pago" atras={{ href: '/cuentas-por-pagar', texto: 'Cuentas por Pagar' }} />

      <Link href="/cuentas-por-pagar/propuestas/nueva" className="btn-primary mb-5 w-full sm:w-auto">
        Nueva propuesta
      </Link>

      {propuestas.length === 0 ? (
        <p className="card text-sm text-gray-600">Todavía no se armó ninguna propuesta.</p>
      ) : (
        <ul className="space-y-2">
          {propuestas.map((p) => (
            <li key={p.id}>
              <Link href={`/cuentas-por-pagar/propuestas/${p.id}`} className="card block transition hover:shadow-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium">{p.codigo}</span>
                  <span className="text-sm text-gray-600">{ETIQUETA_ESTADO_PROPUESTA[p.estado]}</span>
                </div>
                <p className="mt-0.5 text-sm text-gray-600">
                  {p.totalObligaciones} {p.totalObligaciones === 1 ? 'obligación' : 'obligaciones'}
                  {p.periodo ? ` · ${p.periodo}` : ''}
                </p>
                {/* Nunca un único total: un lote puede mezclar PEN y USD. */}
                <TotalesPorMoneda total={p.totalPorMoneda ?? []} pendiente={p.pendientePorMoneda ?? []} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}

/**
 * Totales agrupados por moneda. Muestra el pendiente aparte solo cuando
 * difiere del total — en un lote sin pagar nada, repetir el mismo número
 * dos veces es ruido.
 */
function TotalesPorMoneda({ total, pendiente }: { total: MontoPorMoneda[]; pendiente: MontoPorMoneda[] }) {
  if (total.length === 0) return null
  const hayDiferencia = JSON.stringify(total) !== JSON.stringify(pendiente)
  return (
    <p className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-sm">
      {total.map((t) => (
        <span key={t.moneda} className="font-medium tabular-nums">
          <Money valor={t.monto} moneda={t.moneda} />
        </span>
      ))}
      {hayDiferencia ? (
        <span className="text-xs text-gray-600">
          sin pagar:{' '}
          {pendiente.length === 0
            ? 'nada'
            : pendiente.map((t) => `${t.moneda} ${t.monto.toFixed(2)}`).join(' · ')}
        </span>
      ) : null}
    </p>
  )
}
