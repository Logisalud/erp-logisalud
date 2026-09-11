import Link from 'next/link'
import { Encabezado } from '@/components/nav'
import { Money } from '@/components/money'
import { listarPagosPorEjecutar, puedeVerPagosPorEjecutar } from '@/services/pagos-por-ejecutar'
import { etiquetaEspera } from '@/domain/pendientes-aprobar'

export const dynamic = 'force-dynamic'

/**
 * La bandeja de Tesorería: los lotes aprobados que todavía tienen pagos por
 * hacer. Contraparte de "Pendientes de aprobar".
 *
 * Lista LOTES, no obligaciones: un pago real es una corrida de
 * transferencias que se hace de una sentada, y eso es lo que una propuesta
 * representa. Y no ejecuta ningún pago — lleva a la propuesta, donde el pago
 * ya vive. Poner el formulario acá (o en el listado de Cuentas por Pagar)
 * saltearía la aprobación del lote, que es la regla de oro del módulo.
 */
export default async function PagosPorEjecutar() {
  if (!(await puedeVerPagosPorEjecutar())) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <Encabezado titulo="Pagos por ejecutar" atras={{ href: '/', texto: 'Compras y Pagos' }} />
        <p className="card text-sm text-gray-600">Esta pantalla es de Tesorería y Contabilidad.</p>
      </main>
    )
  }

  const lotes = await listarPagosPorEjecutar()

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Encabezado titulo="Pagos por ejecutar" atras={{ href: '/', texto: 'Compras y Pagos' }} />

      {lotes.length === 0 ? (
        <p className="card text-sm text-gray-600">
          No hay nada por pagar: ninguna propuesta aprobada tiene desembolsos pendientes. Cuando
          Contabilidad apruebe un lote, va a aparecer aquí.
        </p>
      ) : (
        <>
          <p className="mb-3 text-sm text-gray-600">
            {lotes.length === 1 ? '1 lote aprobado espera' : `${lotes.length} lotes aprobados esperan`} tu
            ejecución. Lo más viejo va primero.
          </p>
          <ul className="space-y-2">
            {lotes.map((l) => (
              <li key={l.id}>
                <Link href={l.href} className="card block transition hover:shadow-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <span className="font-medium">{l.codigo}</span>
                    <span className="flex flex-wrap gap-x-3 tabular-nums">
                      {l.pendientePorMoneda.length === 0
                        ? null
                        : l.pendientePorMoneda.map((t) => (
                            <Money key={t.moneda} valor={t.monto} moneda={t.moneda} />
                          ))}
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm text-gray-600">
                    {l.pendientes} de {l.total} {l.total === 1 ? 'obligación' : 'obligaciones'} sin pagar
                    {l.periodo ? ` · ${l.periodo}` : ''}
                  </p>
                  {/* La espera que le importa a Tesorería arranca en la
                      aprobación (migración 0050). Los lotes aprobados antes
                      de esa migración no tienen la fecha, y ahí la etiqueta
                      dice "creada" en vez de afirmar algo que no se sabe. */}
                  <p className="mt-1 text-xs text-gray-500">
                    {l.esperaDesde === 'aprobacion' ? 'Aprobada' : 'Creada'} hace{' '}
                    {etiquetaEspera(l.diasEsperando).toLowerCase()}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  )
}
