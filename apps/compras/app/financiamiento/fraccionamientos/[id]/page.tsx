import { notFound } from 'next/navigation'
import { Encabezado } from '@/components/nav'
import { Money } from '@/components/money'
import { obtenerFraccionamiento } from '@/services/financiamiento'
import { ETIQUETA_ESTADO_VENCIMIENTO, estaVencida } from '@/domain/financiamiento'

export const dynamic = 'force-dynamic'

export default async function DetalleFraccionamiento({ params }: { params: { id: string } }) {
  const fraccionamiento = await obtenerFraccionamiento(params.id)
  if (!fraccionamiento) notFound()

  const hoy = new Date().toISOString().slice(0, 10)
  const cuotasVencidas = fraccionamiento.cuotas.filter((c) => c.estado === 'pendiente' && estaVencida(c.fecha_vencimiento, hoy))

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Encabezado titulo={fraccionamiento.numero_expediente} atras={{ href: '/financiamiento/fraccionamientos', texto: 'Fraccionamiento SUNAT' }} />

      {cuotasVencidas.length > 0 ? (
        <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900">
          {cuotasVencidas.length === 1 ? 'Hay una cuota vencida' : `Hay ${cuotasVencidas.length} cuotas vencidas`} sin
          obligación generada todavía — riesgo de perder el beneficio del fraccionamiento (regla 10).
        </p>
      ) : null}

      <section className="card">
        <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-2">
          <div className="flex gap-2"><dt className="text-gray-500">Deuda original:</dt><dd><Money valor={fraccionamiento.deuda_original} /></dd></div>
          {fraccionamiento.tipo ? <div className="flex gap-2"><dt className="text-gray-500">Tipo:</dt><dd>{fraccionamiento.tipo}</dd></div> : null}
        </dl>
      </section>

      <section className="mt-6">
        <h2 className="font-heading mb-2 text-lg">Cronograma de cuotas</h2>
        <ul className="space-y-2">
          {fraccionamiento.cuotas.map((c) => (
            <li key={c.id} className="card flex items-baseline justify-between gap-3">
              <div>
                <span className="font-medium">Cuota {c.numero_cuota}</span>
                <p className="mt-0.5 text-sm text-gray-600">
                  vence {c.fecha_vencimiento} · {ETIQUETA_ESTADO_VENCIMIENTO[c.estado] ?? c.estado}
                  {c.estado === 'pendiente' && estaVencida(c.fecha_vencimiento, hoy) ? (
                    <span className="ml-2 text-xs font-medium text-red-700">vencida</span>
                  ) : null}
                </p>
              </div>
              <Money valor={c.monto_cuota} />
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
