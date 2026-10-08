import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { exigirContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import { ETIQUETA_TIPO_INGRESO } from '@/domain/entradas'
import { PanelExpediente } from '@/components/expedientes/panel-expediente'

export const metadata = { title: 'Expediente — WMS LOGISALUD' }

export default async function DetalleExpediente({ params }: { params: { id: string } }) {
  const ctx = await exigirContexto()
  const exp = await repositorio().obtenerExpediente(decodeURIComponent(params.id))
  if (!exp) notFound()
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/expedientes" className="inline-flex min-h-10 items-center gap-1.5 text-sm text-gray-700 hover:underline"><ArrowLeft className="h-4 w-4" aria-hidden />Expedientes</Link>
      <header>
        <p className="text-sm text-gray-600">{exp.tipo === 'OC' ? 'Orden de compra' : 'Acta'}</p>
        <h1 className="font-heading text-3xl font-semibold uppercase tracking-wide text-gray-900" data-testid="titulo-expediente">{exp.clave}</h1>
        <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
          {exp.ingresos.map((i) => <li key={i.id}><Link href={`/entradas/${i.id}`} className="inline-flex items-center gap-1 text-gray-800 underline">{ETIQUETA_TIPO_INGRESO[i.tipo]}{i.actaNumero ? ` · acta ${i.actaNumero}` : ''} · {i.unidades.toLocaleString('es-PE')} und.<ArrowRight className="h-3.5 w-3.5" aria-hidden /></Link></li>)}
        </ul>
      </header>
      <PanelExpediente exp={exp} roles={ctx.roles} />
    </div>
  )
}
