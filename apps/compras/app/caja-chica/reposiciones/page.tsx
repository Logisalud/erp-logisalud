import Link from 'next/link'
import { Encabezado } from '@/components/nav'
import { Money } from '@/components/money'
import { listarMisReposiciones, listarReposicionesPendientes } from '@/services/caja-chica'
import { ETIQUETA_ESTADO_REPOSICION } from '@/domain/caja-chica'

export const dynamic = 'force-dynamic'

export default async function Reposiciones() {
  const [pendientes, mias] = await Promise.all([listarReposicionesPendientes(), listarMisReposiciones()])

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Encabezado titulo="Reposiciones" atras={{ href: '/caja-chica', texto: 'Caja Chica' }} />

      {pendientes.length > 0 ? (
        <section className="mb-6">
          <h2 className="font-heading mb-2 text-lg">Esperando una decisión</h2>
          <ul className="space-y-2">
            {pendientes.map((r) => (
              <li key={r.id}>
                <Link href={`/caja-chica/reposiciones/${r.id}`} className="card block border-amber-200 transition hover:shadow-sm">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium">{r.codigo}</span>
                    <Money valor={r.monto_solicitado} />
                  </div>
                  <p className="mt-0.5 text-sm text-gray-600">{ETIQUETA_ESTADO_REPOSICION[r.estado]}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h2 className="font-heading mb-2 text-lg">Mis reposiciones</h2>
        {mias.length === 0 ? (
          <p className="card text-sm text-gray-600">Todavía no pediste ninguna reposición.</p>
        ) : (
          <ul className="space-y-2">
            {mias.map((r) => (
              <li key={r.id}>
                <Link href={`/caja-chica/reposiciones/${r.id}`} className="card block transition hover:shadow-sm">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium">{r.codigo}</span>
                    <Money valor={r.monto_solicitado} />
                  </div>
                  <p className="mt-0.5 text-sm text-gray-600">{ETIQUETA_ESTADO_REPOSICION[r.estado]}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
