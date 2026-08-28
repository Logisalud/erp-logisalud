import Link from 'next/link'
import { Encabezado } from '@/components/nav'
import { listarPropuestas } from '@/services/propuestas'
import { ETIQUETA_ESTADO_PROPUESTA } from '@/domain/propuesta'

export const dynamic = 'force-dynamic'

export default async function Propuestas() {
  const propuestas = await listarPropuestas()

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Encabezado titulo="Propuestas de pago" atras={{ href: '/cuentas-por-pagar', texto: 'Cuentas por Pagar' }} />

      <Link href="/cuentas-por-pagar/propuestas/nueva" className="btn-primary mb-5 w-full sm:w-auto">
        Nueva propuesta
      </Link>

      {propuestas.length === 0 ? (
        <p className="card text-sm text-gray-600">Todavía no se armó ninguna propuesta.</p>
      ) : (
        <ul className="space-y-2">
          {propuestas.map((p) => (
            <li key={p.id}>
              <Link href={`/cuentas-por-pagar/propuestas/${p.id}`} className="card block transition hover:shadow-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium">{p.codigo}</span>
                  <span className="text-sm text-gray-600">{ETIQUETA_ESTADO_PROPUESTA[p.estado]}</span>
                </div>
                <p className="mt-0.5 text-sm text-gray-600">
                  {p.totalObligaciones} {p.totalObligaciones === 1 ? 'obligación' : 'obligaciones'}
                  {p.periodo ? ` · ${p.periodo}` : ''}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
