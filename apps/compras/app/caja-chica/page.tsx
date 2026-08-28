import Link from 'next/link'
import { Encabezado } from '@/components/nav'
import { Money } from '@/components/money'
import { perfilActual } from '@logisalud/auth/server'
import { listarMisFondos } from '@/services/caja-chica'

export const dynamic = 'force-dynamic'

export default async function CajaChica() {
  const [fondos, perfil] = await Promise.all([listarMisFondos(), perfilActual()])
  const puedeAbrirFondo = perfil?.area === 'contabilidad' || perfil?.area === 'admin'

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Encabezado titulo="Caja Chica" atras={{ href: '/', texto: 'Módulos' }} />

      <div className="mb-5 flex flex-wrap gap-3">
        <Link href="/caja-chica/reposiciones" className="btn-secondary w-full sm:w-auto">
          Ver reposiciones
        </Link>
        {puedeAbrirFondo ? (
          <Link href="/caja-chica/nuevo-fondo" className="btn-primary w-full sm:w-auto">
            Abrir fondo nuevo
          </Link>
        ) : null}
      </div>

      <section>
        <h2 className="font-heading mb-2 text-lg">Mis fondos</h2>
        {fondos.length === 0 ? (
          <div className="card space-y-3 text-sm text-gray-600">
            <p>No administrás ningún fondo de caja chica.</p>
            {puedeAbrirFondo ? (
              <Link href="/caja-chica/nuevo-fondo" className="btn-primary w-full sm:w-auto">
                Abrir un fondo
              </Link>
            ) : null}
          </div>
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
