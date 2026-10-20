import Link from 'next/link'
import { ArrowLeft, Lock } from 'lucide-react'
import { exigirContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import { clasesQuePuede, motivosDeCQuePuede } from '@/domain/salida-manual'
import { FormOrdenManual } from '@/components/salidas/form-orden-manual'

export const metadata = { title: 'Nueva Orden de Salida — WMS LOGISALUD' }

export default async function NuevaOrdenDeSalida() {
  const ctx = await exigirContexto()
  const clases = clasesQuePuede(ctx.roles)
  if (clases.length === 0) {
    return (
      <div className="mx-auto max-w-2xl rounded-lg border border-gray-200 bg-white px-6 py-12 text-center" data-testid="nueva-salida-sin-permiso">
        <Lock className="mx-auto h-9 w-9 text-gray-400" aria-hidden />
        <h1 className="mt-3 font-heading text-2xl font-semibold uppercase tracking-wide text-gray-900">Nueva Orden de Salida</h1>
        <p className="mt-2 text-gray-700">Crear una salida a mano es del Jefe de Transporte, del Jefe de Almacén y de quien autoriza salidas sin venta. Si lo necesitas, pídele acceso al administrador del WMS.</p>
        <Link href="/salidas" className="btn-secondary mt-5">Ver las salidas</Link>
      </div>
    )
  }
  const panorama = await repositorio().panorama()
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link href="/salidas" className="inline-flex min-h-10 items-center gap-1.5 text-sm text-gray-700 hover:underline"><ArrowLeft className="h-4 w-4" aria-hidden />Salidas</Link>
      <header>
        <h1 className="font-heading text-3xl font-semibold uppercase tracking-wide text-gray-900">Nueva Orden de Salida</h1>
        <p className="mt-1 max-w-3xl text-gray-700">Para sacar mercadería cuando no viene de un pedido de la bandeja. Elige el tipo, indica los productos y el sistema reserva el stock. Si el pedido llega después por la bandeja, se une a esta orden: no se crea otra.</p>
      </header>
      <FormOrdenManual
        clasesPermitidas={clases} motivosCPermitidos={motivosDeCQuePuede(ctx.roles)} hoy={panorama.hoy}
        propietarios={panorama.propietarios.map((p) => ({ id: p.id, razonSocial: p.razonSocial, esDuenoAlmacen: p.esDuenoAlmacen }))}
      />
    </div>
  )
}
