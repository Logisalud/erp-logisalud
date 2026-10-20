import Link from 'next/link'
import { Lock, Plus } from 'lucide-react'
import { exigirContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import { puedeVerCambiosFefo, puedeVerSalidas } from '@/domain/despacho'
import { ListaSalidas } from '@/components/salidas/lista-salidas'
import { puedeCrearOrdenManual } from '@/domain/salida-manual'

export const metadata = { title: 'Salidas — WMS LOGISALUD' }

const SinPermisoSalidas = () => (
  <div className="mx-auto max-w-2xl rounded-lg border border-gray-200 bg-white px-6 py-12 text-center" data-testid="salidas-sin-permiso">
    <Lock className="mx-auto h-9 w-9 text-gray-400" aria-hidden />
    <p className="mt-3 text-gray-700">Las salidas son del equipo de almacén y transporte. Si las necesitas, pídele acceso al administrador del WMS.</p>
  </div>
)

export default async function Salidas() {
  const ctx = await exigirContexto()
  if (!puedeVerSalidas(ctx.roles)) return <SinPermisoSalidas />
  const salidas = await repositorio().listarSalidas()
  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl font-semibold uppercase tracking-wide text-gray-900">Salidas por pedido</h1>
          <p className="mt-1 max-w-3xl text-gray-600">Cada pedido en ruta tiene su salida: stock asignado por vencimiento, picking y conformidad. Aquí puedes cambiar los lotes antes de que empiece el picking.</p>
        </div>
        {puedeCrearOrdenManual(ctx.roles) && <Link href="/salidas/nueva" className="btn-primary" data-testid="nueva-orden-salida"><Plus className="h-5 w-5" aria-hidden />Nueva Orden de Salida</Link>}
      </header>
      <ListaSalidas salidas={salidas} verCambios={puedeVerCambiosFefo(ctx.roles)} />
    </div>
  )
}
