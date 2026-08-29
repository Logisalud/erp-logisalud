import { Encabezado } from '@/components/nav'
import { Money } from '@/components/money'
import { obtenerProyeccionPagos, ETIQUETA_VENTANA, VENTANAS_PROYECCION } from '@/services/reportes-cuentas-por-pagar-detalle'
import { ETIQUETA_ORIGEN } from '@/domain/reportes'

export const dynamic = 'force-dynamic'

export default async function ReporteProyeccionPagos() {
  const reporte = await obtenerProyeccionPagos()

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Encabezado titulo="Proyección de pagos" atras={{ href: '/reportes', texto: 'Ver reportes' }} />

      {reporte.ventanas.map((v) => (
        <section key={v.ventana} className="card mt-4 first:mt-0">
          <div className="flex items-baseline justify-between">
            <h2 className="font-heading text-lg">{ETIQUETA_VENTANA[v.ventana]}</h2>
            <div className="flex gap-2 text-sm text-gray-600">
              {v.totalPorMoneda.length === 0
                ? 'sin pagos'
                : v.totalPorMoneda.map((t) => <Money key={t.moneda} valor={t.total} moneda={t.moneda} />)}
            </div>
          </div>
          {v.filas.length === 0 ? (
            <p className="mt-2 text-sm text-gray-500">Nada que pagar en esta ventana.</p>
          ) : (
            <ul className="mt-2 divide-y divide-gray-100">
              {v.filas.map((f) => (
                <li key={f.id} className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
                  <span>
                    {f.codigo} · {ETIQUETA_ORIGEN[f.origen]} · {f.quien}
                    {f.fechaVencimiento ? ` · vence ${f.fechaVencimiento}` : ''}
                  </span>
                  <Money valor={f.netoAPagar} moneda={f.moneda} />
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </main>
  )
}
