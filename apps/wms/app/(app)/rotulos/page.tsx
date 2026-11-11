import { Lock } from 'lucide-react'
import { exigirContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import { cajasSaldoDe } from '@/services/rotulos'
import { puedeImprimirRotulos } from '@/domain/rotulos'
import { ListaRotulos } from '@/components/rotulos/lista-rotulos'

export const metadata = { title: 'Rótulos de caja saldo — WMS LOGISALUD' }

export default async function PaginaRotulos() {
  const ctx = await exigirContexto()
  if (!puedeImprimirRotulos(ctx.roles)) {
    return (
      <div className="mx-auto max-w-2xl rounded-lg border border-gray-200 bg-white px-6 py-12 text-center" data-testid="rotulos-sin-permiso">
        <Lock className="mx-auto h-9 w-9 text-gray-400" aria-hidden />
        <h1 className="mt-3 font-heading text-2xl font-semibold uppercase tracking-wide text-gray-900">Rótulos de caja saldo</h1>
        <p className="mt-2 text-gray-700">Esta pantalla es para el personal de almacén. Si la necesitas, pídele acceso al administrador del WMS.</p>
      </div>
    )
  }
  const cajas = cajasSaldoDe(await repositorio().panorama())
  return <ListaRotulos cajas={cajas} />
}
