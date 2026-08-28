import Link from 'next/link'
import { Encabezado } from '@/components/nav'
import { Money } from '@/components/money'
import { listarFraccionamientos } from '@/services/financiamiento'

export const dynamic = 'force-dynamic'

export default async function Fraccionamientos() {
  const fraccionamientos = await listarFraccionamientos()

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Encabezado titulo="Fraccionamiento SUNAT" atras={{ href: '/financiamiento', texto: 'Financiamiento' }} />

      <Link href="/financiamiento/fraccionamientos/nueva" className="btn-primary mb-5 w-full sm:w-auto">
        Nuevo fraccionamiento
      </Link>

      {fraccionamientos.length === 0 ? (
        <p className="card text-sm text-gray-600">Todavía no hay ningún fraccionamiento registrado.</p>
      ) : (
        <ul className="space-y-2">
          {fraccionamientos.map((f) => (
            <li key={f.id}>
              <Link href={`/financiamiento/fraccionamientos/${f.id}`} className="card block transition hover:shadow-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium">{f.numero_expediente}{f.tipo ? ` · ${f.tipo}` : ''}</span>
                  <Money valor={f.deuda_original} />
                </div>
                <p className="mt-0.5 text-sm text-gray-600">{f.estado}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
