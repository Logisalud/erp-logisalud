import { notFound } from 'next/navigation'
import { Lock } from 'lucide-react'
import { exigirContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import { puedeVerSalidas } from '@/domain/despacho'
import { puedeCargar, puedeConfirmarSalida, puedeLiberarUnidad } from '@/domain/carga'
import { PanelCarga } from '@/components/carga/panel-carga'

export const metadata = { title: 'Carga — WMS LOGISALUD' }

export default async function CargaRuta({ params }: { params: { id: string } }) {
  const ctx = await exigirContexto()
  if (!puedeVerSalidas(ctx.roles)) return <div className="mx-auto max-w-2xl rounded-lg border border-gray-200 bg-white px-6 py-12 text-center" data-testid="salidas-sin-permiso"><Lock className="mx-auto h-9 w-9 text-gray-400" aria-hidden /><p className="mt-3 text-gray-700">No tienes acceso a la carga.</p></div>
  const carga = await repositorio().cargaRuta(params.id)
  if (!carga) notFound()
  return <div className="mx-auto max-w-4xl"><PanelCarga carga={carga} puedeCargar={puedeCargar(ctx.roles)} puedeLiberar={puedeLiberarUnidad(ctx.roles)} puedeConfirmar={puedeConfirmarSalida(ctx.roles)} /></div>
}
