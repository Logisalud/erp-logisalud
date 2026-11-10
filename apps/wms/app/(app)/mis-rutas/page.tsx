import { Lock } from 'lucide-react'
import { exigirContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import { puedeVerMisRutas, type RutaMia } from '@/domain/mis-rutas'
import { MisRutas } from '@/components/mis-rutas/mis-rutas'

export const metadata = { title: 'Mis rutas — WMS LOGISALUD' }

export default async function PaginaMisRutas() {
  const ctx = await exigirContexto()
  if (!puedeVerMisRutas(ctx.roles)) {
    return (
      <div className="mx-auto max-w-2xl rounded-lg border border-gray-200 bg-white px-6 py-12 text-center" data-testid="mis-rutas-sin-permiso">
        <Lock className="mx-auto h-9 w-9 text-gray-400" aria-hidden />
        <h1 className="mt-3 font-heading text-2xl font-semibold uppercase tracking-wide text-gray-900">Mis rutas</h1>
        <p className="mt-2 text-gray-700">Esta pantalla es para el conductor y el auxiliar de transporte. Si la necesitas, pídele acceso al administrador del WMS.</p>
      </div>
    )
  }
  let rutas: RutaMia[]
  let error: string | null = null
  try { rutas = await repositorio().misRutas({ id: ctx.usuario.id, nombre: ctx.usuario.nombre, roles: ctx.roles }) } catch (e) { rutas = []; error = e instanceof Error ? e.message : 'No pudimos traer tus rutas. Vuelve a intentarlo.' }
  return <MisRutas rutas={rutas} error={error} />
}
