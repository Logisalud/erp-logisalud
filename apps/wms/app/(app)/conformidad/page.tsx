import { Lock } from 'lucide-react'
import { exigirContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import { puedeVerSalidas } from '@/domain/despacho'
import { ColaOrdenes } from '@/components/picking/cola-ordenes'

export const metadata = { title: 'Conformidad — WMS LOGISALUD' }

export default async function Conformidad() {
  const ctx = await exigirContexto()
  if (!puedeVerSalidas(ctx.roles)) return <div className="mx-auto max-w-2xl rounded-lg border border-gray-200 bg-white px-6 py-12 text-center" data-testid="salidas-sin-permiso"><Lock className="mx-auto h-9 w-9 text-gray-400" aria-hidden /><p className="mt-3 text-gray-700">La conformidad es del personal autorizado.</p></div>
  const cola = await repositorio().colaConformidad()
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header><h1 className="font-heading text-3xl font-semibold uppercase tracking-wide text-gray-900">Conformidad de despacho</h1><p className="mt-1 max-w-3xl text-gray-600">Una segunda persona revisa lo pickeado. Al dar la conformidad, las unidades pasan del rack a la zona de conformidad.</p></header>
      <ColaOrdenes ordenes={cola} modo="conformidad" />
    </div>
  )
}
