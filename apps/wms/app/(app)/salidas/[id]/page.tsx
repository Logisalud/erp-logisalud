import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Info, Lock } from 'lucide-react'
import { modoDemoActivo } from '@/lib/demo'
import { exigirContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import { puedeCambiarLote, puedePrepararSalidas, puedeVerSalidas } from '@/domain/despacho'
import { DetalleSalida } from '@/components/salidas/detalle-salida'
import { modoNubefactActual } from '@/services/nubefact/cliente'
import { puedeEmitirGuia } from '@/domain/guia-electronica'
import { SERIE_GUIA_DEFECTO as datosSerie, puedeAdministrarNumeracion } from '@/domain/numeracion-guias'

export const metadata = { title: 'Salida — WMS LOGISALUD' }

export default async function Salida({ params }: { params: { id: string } }) {
  const ctx = await exigirContexto()
  if (!puedeVerSalidas(ctx.roles)) return <div className="mx-auto max-w-2xl rounded-lg border border-gray-200 bg-white px-6 py-12 text-center" data-testid="salidas-sin-permiso"><Lock className="mx-auto h-9 w-9 text-gray-400" aria-hidden /><p className="mt-3 text-gray-700">No tienes acceso a las salidas.</p></div>
  const repo = repositorio()
  const [salida, paquete] = await Promise.all([repo.obtenerSalida(params.id), repo.paqueteSalida(params.id)])
  if (!salida) {
    // En la demostración cada servidor de Vercel guarda sus propios datos: una orden creada en uno puede no existir en el que atiende el clic
    if (modoDemoActivo()) return <div className="mx-auto max-w-2xl rounded-lg border border-gray-200 bg-white px-6 py-12 text-center" data-testid="salida-demo-otra-instancia"><Info className="mx-auto h-9 w-9 text-teal-600" aria-hidden /><h1 className="mt-3 font-heading text-xl font-semibold uppercase tracking-wide text-gray-900">Esta orden no está en este servidor de la demo</h1><p className="mt-2 text-gray-700">La demostración guarda sus datos en la memoria de cada servidor. Si creaste o cambiaste esta orden hace un rato, puede estar en otro servidor. Vuelve a la lista y ábrela de nuevo; si no aparece, créala otra vez. En el sistema real esto no pasa.</p><Link href="/salidas" className="btn-primary mt-6 inline-flex">Volver a Órdenes de salida</Link></div>
    notFound()
  }
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
  const guia = paquete?.conforme && !paquete.guia ? await repo.datosGuia(params.id) : null
  const eventos = await repo.eventosPedidos({ salidaId: params.id })
  const numeracion = paquete?.conforme && salida.tipo !== 'CLIENTE' && (puedeEmitirGuia(ctx.roles) || puedeAdministrarNumeracion(ctx.roles)) ? await repo.estadoNumeracionGuia(datosSerie) : null
  return <div className="mx-auto max-w-6xl"><DetalleSalida salida={salida} puedeEditar={puedeCambiarLote(ctx.roles)} puedePreparar={puedePrepararSalidas(ctx.roles)} paquete={paquete} guia={{ datos: guia, modo: modoNubefactActual(), hoy, eventos, numeracion }} roles={ctx.roles} usuario={ctx.usuario.nombre} /></div>
}
