import Link from 'next/link'
import { Encabezado } from '@/components/nav'
import { Money } from '@/components/money'
import { listarObligacionesTributarias } from '@/services/impuestos'
import { agruparPorPeriodo, ETIQUETA_ESTADO_TRIBUTARIA } from '@/domain/impuestos'
import { ConfirmarBoton } from './confirmar-boton'

export const dynamic = 'force-dynamic'

export default async function Impuestos() {
  const todas = await listarObligacionesTributarias()
  const pendientes = todas.filter((o) => o.estado === 'pendiente_contabilidad')
  const resto = todas.filter((o) => o.estado !== 'pendiente_contabilidad')

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Encabezado titulo="Impuestos" atras={{ href: '/financiamiento', texto: 'Financiamiento' }} />

      <div className="mb-5 flex flex-wrap gap-3">
        <Link href="/impuestos/nueva" className="btn-primary w-full sm:w-auto">
          Cargar impuestos del periodo
        </Link>
        <Link href="/impuestos/tipos" className="btn-secondary w-full sm:w-auto">
          Tipos de impuesto
        </Link>
      </div>

      {/* Agrupado por periodo, que es como llega y como se revisa: un envío
          de PLAME es de un mes. El periodo cumple la función de agrupador,
          así que no hace falta un lote_id. */}
      {pendientes.length > 0 ? (
        <section className="mb-6">
          <h2 className="font-heading mb-2 text-lg">Esperando a Contabilidad</h2>
          {agruparPorPeriodo(pendientes).map((grupo) => (
            <div key={grupo.periodo} className="mb-4">
              <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-medium text-gray-800">{grupo.periodo}</h3>
                <span className="text-sm text-gray-600">
                  {grupo.filas.length} {grupo.filas.length === 1 ? 'impuesto' : 'impuestos'} · total{' '}
                  <strong className="tabular-nums">{grupo.total.toFixed(2)}</strong>
                </span>
              </div>
              <ul className="space-y-2">
                {grupo.filas.map((o) => (
                  <li key={o.id} className="card border-amber-200">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-medium">{o.tipo_impuesto?.nombre ?? '—'}</span>
                      <Money valor={o.monto} moneda={o.moneda} />
                    </div>
                    <p className="mt-0.5 text-sm text-gray-600">
                      vence {o.fecha_vencimiento} · fuente del dato: {o.fuente}
                    </p>
                    <div className="mt-3">
                      <ConfirmarBoton id={o.id} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ) : null}

      <section>
        <h2 className="font-heading mb-2 text-lg">Historial</h2>
        {resto.length === 0 ? (
          <p className="card text-sm text-gray-600">Todavía no hay ninguna obligación tributaria confirmada.</p>
        ) : (
          agruparPorPeriodo(resto).map((grupo) => (
            <div key={grupo.periodo} className="mb-4">
              <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-medium text-gray-800">{grupo.periodo}</h3>
                <span className="text-sm text-gray-600">
                  total <strong className="tabular-nums">{grupo.total.toFixed(2)}</strong>
                </span>
              </div>
              <ul className="space-y-2">
                {grupo.filas.map((o) => (
                  <li key={o.id} className="card">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-medium">{o.tipo_impuesto?.nombre ?? '—'}</span>
                      <Money valor={o.monto} moneda={o.moneda} />
                    </div>
                    <p className="mt-0.5 text-sm text-gray-600">
                      vence {o.fecha_vencimiento} · {ETIQUETA_ESTADO_TRIBUTARIA[o.estado]}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>
    </main>
  )
}
