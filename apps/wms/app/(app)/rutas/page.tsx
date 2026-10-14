import { Lock } from 'lucide-react'
import { exigirContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import { puedePlanificarRutas, puedeVerRutas } from '@/domain/rutas'
import { ListaRutas } from '@/components/rutas/lista-rutas'

export const metadata = { title: 'Rutas de distribución — WMS LOGISALUD' }

export default async function Rutas() {
  const ctx = await exigirContexto()
  if (!puedeVerRutas(ctx.roles)) {
    return (
      <div className="mx-auto max-w-2xl rounded-lg border border-gray-200 bg-white px-6 py-12 text-center" data-testid="rutas-sin-permiso">
        <Lock className="mx-auto h-9 w-9 text-gray-400" aria-hidden />
        <h1 className="mt-3 font-heading text-2xl font-semibold uppercase tracking-wide text-gray-900">Rutas de distribución</h1>
        <p className="mt-2 text-gray-700">Las rutas son del equipo de transporte y del almacén. Si las necesitas, pídele acceso al administrador del WMS.</p>
      </div>
    )
  }
  const panorama = await repositorio().panoramaRutas()
  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <header>
        <h1 className="font-heading text-3xl font-semibold uppercase tracking-wide text-gray-900">Rutas de distribución</h1>
        <p className="mt-1 max-w-3xl text-gray-600">Arma la ruta del día: elige el vehículo y el personal, agrega los pedidos y ordena las paradas. Al meter un pedido en la ruta, el WMS le asigna el stock por vencimiento (FEFO).</p>
      </header>
      <ListaRutas panorama={panorama} puedePlanificar={puedePlanificarRutas(ctx.roles)} />
    </div>
  )
}
