import { notFound } from 'next/navigation'
import { Encabezado } from '@/components/nav'
import { Money } from '@/components/money'
import { obtenerPrestamo } from '@/services/financiamiento'
import { ETIQUETA_ESTADO_VENCIMIENTO, estaVencida } from '@/domain/financiamiento'

export const dynamic = 'force-dynamic'

export default async function DetallePrestamo({ params }: { params: { id: string } }) {
  const prestamo = await obtenerPrestamo(params.id)
  if (!prestamo) notFound()

  const hoy = new Date().toISOString().slice(0, 10)

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Encabezado titulo={prestamo.entidad_financiera} atras={{ href: '/financiamiento/prestamos', texto: 'Préstamos' }} />

      <section className="card">
        <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-2">
          <div className="flex gap-2"><dt className="text-gray-500">Monto original:</dt><dd><Money valor={prestamo.monto_original} moneda={prestamo.moneda} /></dd></div>
          {prestamo.numero_prestamo ? <div className="flex gap-2"><dt className="text-gray-500">N° préstamo:</dt><dd>{prestamo.numero_prestamo}</dd></div> : null}
        </dl>
      </section>

      <section className="mt-6">
        <h2 className="font-heading mb-2 text-lg">Cronograma de cuotas</h2>
        <ul className="space-y-2">
          {prestamo.cuotas.map((c) => (
            <li key={c.id} className="card flex items-baseline justify-between gap-3">
              <div>
                <span className="font-medium">Cuota {c.numero_cuota}</span>
                <p className="mt-0.5 text-sm text-gray-600">
                  vence {c.fecha_vencimiento} · {ETIQUETA_ESTADO_VENCIMIENTO[c.estado] ?? c.estado}
                  {c.estado === 'pendiente' && estaVencida(c.fecha_vencimiento, hoy) ? (
                    <span className="ml-2 text-xs font-medium text-red-700">¡vencida!</span>
                  ) : null}
                </p>
              </div>
              <Money valor={c.monto_cuota} moneda={prestamo.moneda} />
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
