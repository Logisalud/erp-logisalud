import Link from 'next/link'
import { ArrowRight, FolderOpen } from 'lucide-react'
import { exigirContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'

export const metadata = { title: 'Expedientes — WMS LOGISALUD' }

export default async function Expedientes() {
  await exigirContexto()
  const lista = await repositorio().listarExpedientes()
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="font-heading text-3xl font-semibold uppercase tracking-wide text-gray-900">Expedientes</h1>
        <p className="mt-1 text-gray-700">Los documentos de cada compra o ingreso, juntos. La orden de compra (o el número de acta, si no hubo compra) los agrupa.</p>
      </header>
      {lista.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 py-12 text-center" data-testid="expedientes-vacio"><FolderOpen className="h-10 w-10 text-gray-400" aria-hidden /><p className="font-heading text-xl uppercase tracking-wide text-gray-800">Todavía no hay expedientes</p><p className="max-w-md text-sm text-gray-600">Se abre uno solo cuando se confirma un ingreso.</p></div>
      ) : (
        <ul className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 bg-white">
          {lista.map((x) => (
            <li key={x.id}>
              <Link href={`/expedientes/${x.id}`} className="flex min-h-16 flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 transition duration-fast hover:bg-gray-50" data-testid="fila-expediente">
                <span className="min-w-0"><span className="block font-medium text-gray-900">{x.clave}</span><span className="block text-sm text-gray-600">{x.tipo === 'OC' ? 'Orden de compra' : 'Acta'} · {x.ingresos} {x.ingresos === 1 ? 'ingreso' : 'ingresos'} · {x.documentos} documentos</span></span>
                <span className="flex items-center gap-3">
                  {x.estado === 'CERRADO' ? <span className="rounded-full border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-medium text-green-800">Cerrado</span>
                    : x.faltantesAbiertos > 0 ? <span className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900">{x.faltantesAbiertos} {x.faltantesAbiertos === 1 ? 'faltante' : 'faltantes'}</span>
                    : <span className="rounded-full border border-teal-300 bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-900">Listo para cerrar</span>}
                  <ArrowRight className="h-4 w-4 text-gray-400" aria-hidden />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
