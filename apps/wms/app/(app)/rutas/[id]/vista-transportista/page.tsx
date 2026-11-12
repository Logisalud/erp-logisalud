import { notFound } from 'next/navigation'
import { Lock } from 'lucide-react'
import { exigirContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import { puedeVerRutas } from '@/domain/rutas'
import { VistaTransportista } from '@/components/rutas/vista-transportista'

export const metadata = { title: 'Así la ve el transportista — WMS LOGISALUD' }

export default async function PaginaVistaTransportista({ params }: { params: { id: string } }) {
  const ctx = await exigirContexto()
  if (!puedeVerRutas(ctx.roles)) {
    return <div className="mx-auto max-w-2xl rounded-lg border border-gray-200 bg-white px-6 py-12 text-center" data-testid="rutas-sin-permiso"><Lock className="mx-auto h-9 w-9 text-gray-400" aria-hidden /><p className="mt-3 text-gray-700">Esta pantalla es para el Jefe de Transporte y quien ve las rutas.</p></div>
  }
  const ruta = await repositorio().rutaComoLaVeElTransportista(params.id)
  if (!ruta) notFound()
  return <VistaTransportista ruta={ruta} />
}
