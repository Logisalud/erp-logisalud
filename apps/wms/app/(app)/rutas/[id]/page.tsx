import { notFound } from 'next/navigation'
import { Lock } from 'lucide-react'
import { exigirContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import { puedePlanificarRutas, puedeVerRutas } from '@/domain/rutas'
import { EditorRuta } from '@/components/rutas/editor-ruta'

export const metadata = { title: 'Ruta — WMS LOGISALUD' }

export default async function Ruta({ params }: { params: { id: string } }) {
  const ctx = await exigirContexto()
  if (!puedeVerRutas(ctx.roles)) {
    return <div className="mx-auto max-w-2xl rounded-lg border border-gray-200 bg-white px-6 py-12 text-center" data-testid="rutas-sin-permiso"><Lock className="mx-auto h-9 w-9 text-gray-400" aria-hidden /><p className="mt-3 text-gray-700">No tienes acceso a las rutas.</p></div>
  }
  const repo = repositorio()
  const [ruta, panorama] = await Promise.all([repo.obtenerRuta(params.id), repo.panoramaRutas()])
  if (!ruta) notFound()
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header><h1 className="font-heading text-3xl font-semibold uppercase tracking-wide text-gray-900">Planificar ruta</h1>
        {!puedePlanificarRutas(ctx.roles) && <p className="mt-1 text-gray-600">Solo el Jefe de Transporte cambia el plan; aquí puedes verlo.</p>}</header>
      <EditorRuta ruta={ruta} panorama={panorama} soloLectura={!puedePlanificarRutas(ctx.roles)} />
    </div>
  )
}
