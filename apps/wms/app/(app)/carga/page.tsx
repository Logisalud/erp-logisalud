import { Lock } from 'lucide-react'
import { exigirContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import { puedeVerSalidas } from '@/domain/despacho'
import { ColaCarga } from '@/components/carga/cola-carga'

export const metadata = { title: 'Carga — WMS LOGISALUD' }

export default async function Carga() {
  const ctx = await exigirContexto()
  if (!puedeVerSalidas(ctx.roles)) return <div className="mx-auto max-w-2xl rounded-lg border border-gray-200 bg-white px-6 py-12 text-center" data-testid="salidas-sin-permiso"><Lock className="mx-auto h-9 w-9 text-gray-400" aria-hidden /><p className="mt-3 text-gray-700">La carga es del personal de almacén y transporte.</p></div>
  const rutas = await repositorio().colaCarga()
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header><h1 className="font-heading text-3xl font-semibold uppercase tracking-wide text-gray-900">Carga de la unidad</h1><p className="mt-1 max-w-3xl text-gray-600">Revisa el vehículo, carga cada bulto escaneando su QR, concilia lo que falta y libera la unidad. El stock sale cuando se confirma la salida.</p></header>
      <ColaCarga rutas={rutas} />
    </div>
  )
}
