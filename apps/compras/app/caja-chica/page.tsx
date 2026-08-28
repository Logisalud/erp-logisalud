import Link from 'next/link'
import { Encabezado } from '@/components/nav'
import { Money } from '@/components/money'
import { listarMisFondos } from '@/services/caja-chica'

export const dynamic = 'force-dynamic'

export default async function CajaChica() {
  const fondos = await listarMisFondos()

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Encabezado titulo="Caja Chica" atras={{ href: '/', texto: 'Módulos' }} />

      <Link href="/caja-chica/reposiciones" className="btn-secondary mb-5 w-full sm:w-auto">
        Ver reposiciones
      </Link>

      <section>
        <h2 className="font-heading mb-2 text-lg">Mis fondos</h2>
        {fondos.length === 0 ? (
          <p className="card text-sm text-gray-600">No administrás ningún fondo de caja chica.</p>
        ) : (
          <ul className="space-y-2">
            {fondos.map((f) => (
              <li key={f.id}>
                <Link href={`/caja-chica/fondos/${f.id}`} className="card block transition hover:shadow-sm">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium">{f.descripcion ?? 'Fondo fijo'}</span>
                    <Money valor={f.monto_fijo} moneda={f.moneda} />
                  </div>
                  <p className="mt-0.5 text-sm text-gray-600">Área: {f.area}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
