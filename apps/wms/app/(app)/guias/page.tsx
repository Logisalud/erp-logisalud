import { Lock } from 'lucide-react'
import { exigirContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import { puedeVerSalidas } from '@/domain/despacho'
import { BuscadorGuias } from '@/components/guias/buscador-guias'

export const metadata = { title: 'Guías de remisión — WMS LOGISALUD' }

export default async function Guias() {
  const ctx = await exigirContexto()
  if (!puedeVerSalidas(ctx.roles)) {
    return (
      <div className="mx-auto max-w-2xl rounded-lg border border-gray-200 bg-white px-6 py-12 text-center" data-testid="guias-sin-permiso">
        <Lock className="mx-auto h-9 w-9 text-gray-400" aria-hidden />
        <p className="mt-3 text-gray-700">Las guías son del equipo de almacén y transporte. Si las necesitas, pídele acceso al administrador del WMS.</p>
      </div>
    )
  }
  const guias = await repositorio().listarGuias()
  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <header>
        <h1 className="font-heading text-3xl font-semibold uppercase tracking-wide text-gray-900">Guías de remisión</h1>
        <p className="mt-1 max-w-3xl text-gray-600">Busca una guía por su número, su orden, el cliente o proveedor, la ruta o la placa, y mira en qué estado está: aceptada por SUNAT, esperando respuesta, rechazada o anulada.</p>
      </header>
      <BuscadorGuias guias={guias} />
    </div>
  )
}
