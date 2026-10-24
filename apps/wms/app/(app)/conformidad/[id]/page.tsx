import { notFound } from 'next/navigation'
import { Lock } from 'lucide-react'
import { exigirContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import { puedeVerSalidas } from '@/domain/despacho'
import { ConformidadOrden } from '@/components/picking/conformidad-orden'

export const metadata = { title: 'Conformidad — WMS LOGISALUD' }

export default async function OrdenConformidadPagina({ params }: { params: { id: string } }) {
  const ctx = await exigirContexto()
  if (!puedeVerSalidas(ctx.roles)) return <div className="mx-auto max-w-2xl rounded-lg border border-gray-200 bg-white px-6 py-12 text-center" data-testid="salidas-sin-permiso"><Lock className="mx-auto h-9 w-9 text-gray-400" aria-hidden /><p className="mt-3 text-gray-700">No tienes acceso a la conformidad.</p></div>
  const orden = await repositorio().obtenerOrdenPicking(params.id)
  if (!orden) notFound()
  const personal = await repositorio().personalDePicking()
  return <div className="mx-auto max-w-5xl"><ConformidadOrden orden={orden} roles={ctx.roles} personaId={ctx.usuario.id} personal={personal} puedeDesignar={ctx.roles.some((r) => r === 'jefe_almacen' || r === 'asistente_dt' || r === 'jefe_transporte')} /></div>
}
