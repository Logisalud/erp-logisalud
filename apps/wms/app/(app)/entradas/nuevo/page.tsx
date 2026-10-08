import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { exigirContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import { puede } from '@/domain/permisos'
import { FormNuevoIngreso } from '@/components/entradas/form-nuevo-ingreso'

export const metadata = { title: 'Nuevo ingreso — WMS LOGISALUD' }

export default async function NuevoIngreso() {
  const ctx = await exigirContexto()
  if (!puede(ctx.roles, 'ejecutar')) redirect('/entradas')
  const repo = repositorio()
  const [panorama, recepciones] = await Promise.all([repo.panorama(), repo.recepcionesDeCompra()])
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/entradas" className="inline-flex min-h-10 items-center gap-1.5 text-sm text-gray-700 hover:underline"><ArrowLeft className="h-4 w-4" aria-hidden />Entradas</Link>
      <header>
        <h1 className="font-heading text-3xl font-semibold uppercase tracking-wide text-gray-900">Nuevo ingreso</h1>
        <p className="mt-1 text-gray-700">Primero dinos qué llegó. Después repartes las unidades en lotes y se genera el acta.</p>
      </header>
      <FormNuevoIngreso propietarios={panorama.propietarios} recepciones={recepciones} />
    </div>
  )
}
