import Link from 'next/link'
import { Encabezado } from '@/components/nav'
import { Money } from '@/components/money'
import { listarObligacionesTributarias } from '@/services/impuestos'
import { ETIQUETA_ESTADO_TRIBUTARIA } from '@/domain/impuestos'
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
          Cargar obligación tributaria
        </Link>
        <Link href="/impuestos/tipos" className="btn-secondary w-full sm:w-auto">
          Tipos de impuesto
        </Link>
      </div>

      {pendientes.length > 0 ? (
        <section className="mb-6">
          <h2 className="font-heading mb-2 text-lg">Esperando a Contabilidad</h2>
          <ul className="space-y-2">
            {pendientes.map((o) => (
              <li key={o.id} className="card border-amber-200">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium">{o.tipo_impuesto?.nombre ?? '—'} · {o.periodo}</span>
                  <Money valor={o.monto} moneda={o.moneda} />
                </div>
                <p className="mt-0.5 text-sm text-gray-600">vence {o.fecha_vencimiento} · fuente {o.fuente}</p>
                <div className="mt-3">
                  <ConfirmarBoton id={o.id} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h2 className="font-heading mb-2 text-lg">Historial</h2>
        {resto.length === 0 ? (
          <p className="card text-sm text-gray-600">Todavía no hay ninguna obligación tributaria confirmada.</p>
        ) : (
          <ul className="space-y-2">
            {resto.map((o) => (
              <li key={o.id} className="card">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium">{o.tipo_impuesto?.nombre ?? '—'} · {o.periodo}</span>
                  <Money valor={o.monto} moneda={o.moneda} />
                </div>
                <p className="mt-0.5 text-sm text-gray-600">vence {o.fecha_vencimiento} · {ETIQUETA_ESTADO_TRIBUTARIA[o.estado]}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
