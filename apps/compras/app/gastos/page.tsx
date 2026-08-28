import Link from 'next/link'
import { Encabezado } from '@/components/nav'
import { Money } from '@/components/money'
import { listarMisSolicitudes, listarSolicitudesPendientes } from '@/services/solicitudes-gasto'
import { ETIQUETA_ESTADO, ETIQUETA_TIPO } from '@/domain/gasto'

export const dynamic = 'force-dynamic'

export default async function Gastos() {
  const [mias, pendientes] = await Promise.all([listarMisSolicitudes(), listarSolicitudesPendientes()])

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Encabezado titulo="Gastos y Anticipos" atras={{ href: '/', texto: 'Módulos' }} />

      <Link href="/gastos/nueva" className="btn-primary mb-5 w-full sm:w-auto">
        Nueva solicitud
      </Link>

      {pendientes.length > 0 ? (
        <section className="mb-6">
          <h2 className="font-heading mb-2 text-lg">Esperando una decisión</h2>
          <ul className="space-y-2">
            {pendientes.map((s) => (
              <li key={s.id}>
                <Link href={`/gastos/${s.id}`} className="card block border-amber-200 transition hover:shadow-sm">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium">{s.codigo} · {ETIQUETA_TIPO[s.tipo]}</span>
                    <Money valor={s.monto_solicitado} moneda={s.moneda} />
                  </div>
                  <p className="mt-0.5 text-sm text-gray-600">{s.descripcion} · {ETIQUETA_ESTADO[s.estado]}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h2 className="font-heading mb-2 text-lg">Mis solicitudes</h2>
        {mias.length === 0 ? (
          <p className="card text-sm text-gray-600">Todavía no pediste ningún gasto o anticipo.</p>
        ) : (
          <ul className="space-y-2">
            {mias.map((s) => (
              <li key={s.id}>
                <Link href={`/gastos/${s.id}`} className="card block transition hover:shadow-sm">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium">{s.codigo} · {ETIQUETA_TIPO[s.tipo]}</span>
                    <Money valor={s.monto_solicitado} moneda={s.moneda} />
                  </div>
                  <p className="mt-0.5 text-sm text-gray-600">{s.descripcion} · {ETIQUETA_ESTADO[s.estado]}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
