import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { exigirContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import { puedePrepararSolicitud } from '@/domain/entradas'
import { FormNuevaSolicitud } from '@/components/entradas/form-nueva-solicitud'

export const metadata = { title: 'Nueva solicitud — WMS LOGISALUD' }

export default async function NuevaSolicitud() {
  const ctx = await exigirContexto()
  if (!puedePrepararSolicitud(ctx.roles)) redirect('/entradas')
  const repo = repositorio()
  const [panorama, ocs] = await Promise.all([repo.panorama(), repo.ocsPendientes()])
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/entradas" className="inline-flex min-h-10 items-center gap-1.5 text-sm text-gray-700 hover:underline"><ArrowLeft className="h-4 w-4" aria-hidden />Entradas</Link>
      <header>
        <h1 className="font-heading text-3xl font-semibold uppercase tracking-wide text-gray-900">Nueva solicitud de ingreso</h1>
        <p className="mt-1 text-gray-700">Anuncia lo que va a llegar. Todavía no hay inventario: cuando llegue, se verifica contra esta solicitud.</p>
      </header>
      <FormNuevaSolicitud propietarios={panorama.propietarios} ocs={ocs} />
    </div>
  )
}
