import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { exigirContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import { ChipActa } from '@/components/entradas/chips-entradas'
import { ChipEstado } from '@/components/chips'
import { FormOrganoleptica } from '@/components/calidad/form-organoleptica'

export const metadata = { title: 'Acta organoléptica — WMS LOGISALUD' }

export default async function ActaOrganoleptica({ params }: { params: { id: string } }) {
  const ctx = await exigirContexto()
  const repo = repositorio()
  const id = decodeURIComponent(params.id)
  const [acta, panorama] = await Promise.all([repo.obtenerOrganoleptica(id), repo.panorama()])
  if (!acta) notFound()
  const puedeEditar = ctx.roles.some((r) => r === 'asistente_dt' || r === 'direccion_tecnica')
  const puedeDecidir = ctx.roles.includes('direccion_tecnica')
  const prefijo = process.env.NEXT_PUBLIC_BASE_PATH ?? ''
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/calidad" className="inline-flex min-h-10 items-center gap-1.5 text-sm text-gray-700 hover:underline"><ArrowLeft className="h-4 w-4" aria-hidden />Calidad</Link>
      <header>
        <div className="flex flex-wrap items-center gap-2">{acta.decision ? <ChipEstado estado={acta.decision} /> : <ChipActa estado={acta.estado === 'PENDIENTE_DT' ? 'PENDIENTE_DT' : 'BORRADOR'} />}<span className="tabular text-sm text-gray-600">{acta.numero}</span></div>
        <h1 className="mt-2 font-heading text-3xl font-semibold uppercase tracking-wide text-gray-900">Evaluación organoléptica</h1>
        <p className="mt-1 text-gray-700">{acta.producto} · lote <strong>{acta.lote}</strong> · <Link href={`/entradas/${acta.solicitudId}`} className="underline">ver la solicitud {acta.solicitudNumero}{acta.actaRecepcion ? ` (acta ${acta.actaRecepcion})` : ''}</Link></p>
      </header>
      <FormOrganoleptica key={`${acta.id}-${acta.estado}`} acta={acta} puedeEditar={puedeEditar} puedeDecidir={puedeDecidir} hoy={panorama.hoy} base={`${prefijo}/calidad/${acta.id}`} />
    </div>
  )
}
