import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { exigirContexto } from '@/lib/contexto'
import { ORDEN_REPORTES, REPORTES, puedeVerReporte } from '@/domain/reportes'

export const metadata = { title: 'Reportes — WMS LOGISALUD' }

export default async function Reportes() {
  const ctx = await exigirContexto()
  const ver = ORDEN_REPORTES.filter((id) => puedeVerReporte(id, ctx.roles))
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <header>
        <h1 className="font-heading text-3xl font-semibold uppercase tracking-wide text-gray-900">Reportes</h1>
        <p className="mt-1 text-gray-600">Filtra, guarda tus vistas y descarga en CSV o Excel. Cada reporte dice para qué sirve y con qué frecuencia mirarlo.</p>
      </header>
      <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white" data-testid="lista-reportes">
        {ver.map((id) => (
          <li key={id}>
            <Link href={`/reportes/${id.toLowerCase()}`} className="flex min-h-16 items-center gap-3 px-4 py-3.5 hover:bg-gray-50 active:bg-gray-100" data-testid="reporte-enlace" data-reporte={id}>
              <span className="min-w-0 flex-1">
                <strong className="block font-medium text-gray-900">{REPORTES[id].titulo}</strong>
                <span className="block text-sm text-gray-700">{REPORTES[id].descripcion}</span>
                <span className="mt-0.5 block text-xs text-gray-700">{REPORTES[id].uso}</span>
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 text-gray-400" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
