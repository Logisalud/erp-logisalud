import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Encabezado } from '@/components/nav'
import { Money } from '@/components/money'
import { obtenerFondo, listarMovimientosSinReponer } from '@/services/caja-chica'
import { PedirReposicion } from './pedir-reposicion'

export const dynamic = 'force-dynamic'

export default async function DetalleFondo({ params }: { params: { id: string } }) {
  const fondo = await obtenerFondo(params.id)
  if (!fondo) notFound()

  const movimientos = await listarMovimientosSinReponer(fondo.id)
  const totalSinReponer = movimientos.reduce((acc, m) => acc + Number(m.monto), 0)

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Encabezado titulo={fondo.descripcion ?? 'Fondo fijo'} atras={{ href: '/caja-chica', texto: 'Caja Chica' }} />

      <section className="card">
        <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-2">
          <div className="flex gap-2"><dt className="text-gray-500">Monto fijo:</dt><dd><Money valor={fondo.monto_fijo} moneda={fondo.moneda} /></dd></div>
          <div className="flex gap-2"><dt className="text-gray-500">Área:</dt><dd>{fondo.area}</dd></div>
        </dl>
      </section>

      <Link href={`/caja-chica/fondos/${fondo.id}/movimientos/nuevo`} className="btn-primary mt-4 w-full sm:w-auto">
        Registrar gasto
      </Link>

      <section className="mt-6">
        <h2 className="font-heading mb-2 text-lg">Gastos sin reponer</h2>
        {movimientos.length === 0 ? (
          <p className="card text-sm text-gray-600">Todavía no hay ningún gasto pendiente de reponer.</p>
        ) : (
          <>
            <ul className="space-y-2">
              {movimientos.map((m) => (
                <li key={m.id} className="card flex items-baseline justify-between gap-3">
                  <div>
                    <span className="font-medium">{m.categoria?.nombre ?? '—'}</span>
                    <p className="mt-0.5 text-sm text-gray-600">
                      {m.fecha} · {m.tipo_comprobante}{m.numero ? ` ${m.numero}` : ''}
                      {!m.sustentable ? <span className="ml-2 text-xs text-amber-700">no sustentable</span> : null}
                    </p>
                  </div>
                  <Money valor={m.monto} moneda={fondo.moneda} />
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-gray-700">
              Total sin reponer: <Money valor={totalSinReponer} moneda={fondo.moneda} />
            </p>
            <div className="mt-3">
              <PedirReposicion fondoId={fondo.id} />
            </div>
          </>
        )}
      </section>
    </main>
  )
}
