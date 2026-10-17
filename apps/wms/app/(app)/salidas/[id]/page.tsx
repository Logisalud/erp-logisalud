import { notFound } from 'next/navigation'
import { Lock } from 'lucide-react'
import { exigirContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import { puedeCambiarLote, puedePrepararSalidas, puedeVerSalidas } from '@/domain/despacho'
import { DetalleSalida } from '@/components/salidas/detalle-salida'
import { modoNubefactActual } from '@/services/nubefact/cliente'

export const metadata = { title: 'Salida — WMS LOGISALUD' }

export default async function Salida({ params }: { params: { id: string } }) {
  const ctx = await exigirContexto()
  if (!puedeVerSalidas(ctx.roles)) return <div className="mx-auto max-w-2xl rounded-lg border border-gray-200 bg-white px-6 py-12 text-center" data-testid="salidas-sin-permiso"><Lock className="mx-auto h-9 w-9 text-gray-400" aria-hidden /><p className="mt-3 text-gray-700">No tienes acceso a las salidas.</p></div>
  const repo = repositorio()
  const [salida, paquete] = await Promise.all([repo.obtenerSalida(params.id), repo.paqueteSalida(params.id)])
  if (!salida) notFound()
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
  const guia = paquete?.conforme && !paquete.guia ? await repo.datosGuia(params.id) : null
  const eventos = await repo.eventosPedidos({ salidaId: params.id })
  return <div className="mx-auto max-w-6xl"><DetalleSalida salida={salida} puedeEditar={puedeCambiarLote(ctx.roles)} puedePreparar={puedePrepararSalidas(ctx.roles)} paquete={paquete} guia={{ datos: guia, modo: modoNubefactActual(), hoy, eventos }} roles={ctx.roles} /></div>
}
