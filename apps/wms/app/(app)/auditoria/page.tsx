import { redirect } from 'next/navigation'
import { History } from 'lucide-react'
import { exigirContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import { puede } from '@/domain/permisos'

export const metadata = { title: 'Auditoría — WMS LOGISALUD' }

const fecha = (ts: string) =>
  new Date(ts).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Lima' })

export default async function Auditoria() {
  const ctx = await exigirContexto()
  if (!puede(ctx.roles, 'auditar')) redirect('/')
  const eventos = await repositorio().auditoria(100)
  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-heading text-3xl font-semibold uppercase tracking-wide text-gray-900">Auditoría</h1>
        <p className="mt-1 text-gray-600">Quién hizo qué, cuándo y por qué. Nada se edita ni se borra: lo que se corrige deja historia.</p>
      </header>
      {eventos.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white px-6 py-12 text-center" data-testid="auditoria-vacia">
          <History className="mx-auto h-9 w-9 text-gray-400" aria-hidden />
          <p className="mt-3 font-medium text-gray-900">Todavía no hay movimientos que auditar</p>
          <p className="mt-1 text-sm text-gray-600">Cuando alguien registre algo en el WMS, aparecerá aquí.</p>
        </div>
      ) : (
        <ul className="divide-y divide-gray-200 overflow-hidden rounded-lg border border-gray-200 bg-white" data-testid="lista-auditoria">
          {eventos.map((e) => (
            <li key={e.id} className="px-4 py-3">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-medium text-gray-900">{e.actor}</span>
                <span className="text-gray-800">{e.detalle ?? e.evento}</span>
                <span className="tabular ml-auto text-xs text-gray-600">{fecha(e.ts)}</span>
              </div>
              <p className="mt-0.5 text-xs text-gray-600">{e.entidad}{e.entidadId ? ` · ${e.entidadId}` : ''}{e.motivo ? ` · Motivo: ${e.motivo}` : ''}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
