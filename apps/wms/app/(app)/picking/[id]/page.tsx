import { notFound } from 'next/navigation'
import { Lock } from 'lucide-react'
import { exigirContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import { puedeCambiarLote, puedePickear, puedeVerSalidas } from '@/domain/despacho'
import { OrdenPicking } from '@/components/picking/orden-picking'

export const metadata = { title: 'Picking — WMS LOGISALUD' }

export default async function OrdenPickingPagina({ params }: { params: { id: string } }) {
  const ctx = await exigirContexto()
  if (!puedeVerSalidas(ctx.roles)) return <div className="mx-auto max-w-2xl rounded-lg border border-gray-200 bg-white px-6 py-12 text-center" data-testid="salidas-sin-permiso"><Lock className="mx-auto h-9 w-9 text-gray-400" aria-hidden /><p className="mt-3 text-gray-700">No tienes acceso al picking.</p></div>
  const orden = await repositorio().obtenerOrdenPicking(params.id)
  if (!orden) notFound()
  return <div className="mx-auto max-w-3xl"><OrdenPicking orden={orden} puedePickear={puedePickear(ctx.roles)} puedeResolver={puedeCambiarLote(ctx.roles)} /></div>
}
