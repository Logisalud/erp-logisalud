import Link from 'next/link'
import { Encabezado } from '@/components/nav'
import { Money } from '@/components/money'
import { listarPrestamos } from '@/services/financiamiento'

export const dynamic = 'force-dynamic'

export default async function Prestamos() {
  const prestamos = await listarPrestamos()

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Encabezado titulo="Préstamos" atras={{ href: '/financiamiento', texto: 'Financiamiento' }} />

      <Link href="/financiamiento/prestamos/nueva" className="btn-primary mb-5 w-full sm:w-auto">
        Nuevo préstamo
      </Link>

      {prestamos.length === 0 ? (
        <p className="card text-sm text-gray-600">Todavía no hay ningún préstamo registrado.</p>
      ) : (
        <ul className="space-y-2">
          {prestamos.map((p) => (
            <li key={p.id}>
              <Link href={`/financiamiento/prestamos/${p.id}`} className="card block transition hover:shadow-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium">{p.entidad_financiera}{p.numero_prestamo ? ` · ${p.numero_prestamo}` : ''}</span>
                  <Money valor={p.monto_original} moneda={p.moneda} />
                </div>
                <p className="mt-0.5 text-sm text-gray-600">{p.estado}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
