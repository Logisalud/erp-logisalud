import Link from 'next/link'
import { Encabezado } from '@/components/nav'
import { Money } from '@/components/money'
import { listarMisOS, listarOSPendientes, listarOSSinObligacion } from '@/services/servicios'
import { ETIQUETA_ESTADO_OS } from '@/domain/servicio'

export const dynamic = 'force-dynamic'

export default async function Servicios() {
  const [mias, pendientes, sinObligacion] = await Promise.all([
    listarMisOS(),
    listarOSPendientes(),
    listarOSSinObligacion(),
  ])

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Encabezado titulo="Servicios" atras={{ href: '/', texto: 'Módulos' }} />

      <Link href="/servicios/nueva" className="btn-primary mb-5 w-full sm:w-auto">
        Nueva orden de servicio
      </Link>

      {pendientes.length > 0 ? (
        <section className="mb-6">
          <h2 className="font-heading mb-2 text-lg">Esperando una decisión</h2>
          <ul className="space-y-2">
            {pendientes.map((os) => (
              <li key={os.id}>
                <Link href={`/servicios/${os.id}`} className="card block border-amber-200 transition hover:shadow-sm">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium">{os.codigo}</span>
                    <Money valor={os.monto_estimado} moneda={os.moneda} />
                  </div>
                  <p className="mt-0.5 text-sm text-gray-600">{os.descripcion_servicio} · {ETIQUETA_ESTADO_OS[os.estado]}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {sinObligacion.length > 0 ? (
        <section className="mb-6">
          <h2 className="font-heading mb-2 text-lg">Facturas de servicio esperando registrarse (Contabilidad)</h2>
          <ul className="space-y-2">
            {sinObligacion.map((os) => (
              <li key={os.id}>
                <Link href={`/servicios/${os.id}`} className="card block border-amber-200 transition hover:shadow-sm">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium">{os.codigo} · {os.proveedor?.razon_social ?? '—'}</span>
                    <Money valor={os.monto_estimado} moneda={os.moneda} />
                  </div>
                  <p className="mt-0.5 text-sm text-gray-600">{os.descripcion_servicio}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h2 className="font-heading mb-2 text-lg">Mis órdenes de servicio</h2>
        {mias.length === 0 ? (
          <p className="card text-sm text-gray-600">Todavía no creaste ninguna orden de servicio.</p>
        ) : (
          <ul className="space-y-2">
            {mias.map((os) => (
              <li key={os.id}>
                <Link href={`/servicios/${os.id}`} className="card block transition hover:shadow-sm">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium">{os.codigo}</span>
                    <Money valor={os.monto_estimado} moneda={os.moneda} />
                  </div>
                  <p className="mt-0.5 text-sm text-gray-600">{os.descripcion_servicio} · {ETIQUETA_ESTADO_OS[os.estado]}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
