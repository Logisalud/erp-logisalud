import { exigirContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import { puedePlanificarRutas, puedeVerRutas } from '@/domain/rutas'
import { RecursosVista } from '@/components/rutas/recursos'

export const metadata = { title: 'Personal y vehículos — WMS LOGISALUD' }

export default async function Recursos() {
  const ctx = await exigirContexto()
  if (!puedeVerRutas(ctx.roles)) return <div className="mx-auto max-w-2xl rounded-lg border border-gray-200 bg-white px-6 py-12 text-center text-gray-700" data-testid="rutas-sin-permiso">No tienes acceso a las rutas.</div>
  const panorama = await repositorio().panoramaRutas()
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <header><h1 className="font-heading text-3xl font-semibold uppercase tracking-wide text-gray-900">Personal y vehículos</h1>
        <p className="mt-1 max-w-3xl text-gray-600">Quién conduce, quién acompaña y qué vehículos hay para armar las rutas. Lo marcado «no disponible» no aparece al planificar.</p></header>
      <RecursosVista panorama={panorama} puedeEditar={puedePlanificarRutas(ctx.roles)} />
    </div>
  )
}
