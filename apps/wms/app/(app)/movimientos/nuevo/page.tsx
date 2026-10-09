import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { redirect } from 'next/navigation'
import { exigirContexto } from '@/lib/contexto'
import { puedePrepararMovimiento } from '@/domain/inventario'
import { FormMover } from '@/components/inventario/form-mover'

export const metadata = { title: 'Mover — WMS LOGISALUD' }

export default async function NuevoMovimiento() {
  const ctx = await exigirContexto()
  if (!puedePrepararMovimiento(ctx.roles)) redirect('/movimientos')
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href="/movimientos" className="inline-flex min-h-10 items-center gap-1.5 text-sm text-gray-700 hover:underline"><ArrowLeft className="h-4 w-4" aria-hidden />Movimientos</Link>
      <header>
        <h1 className="font-heading text-3xl font-semibold uppercase tracking-wide text-gray-900">Mover</h1>
        <p className="mt-1 text-gray-600">Agrega varios productos en una sola orden, cada uno desde donde esté. Elige un destino para todos y cámbialo en una línea si hace falta. Se autoriza una vez y se verifica en una sola revisión. Todavía no cambia el stock.</p>
      </header>
      <FormMover />
    </div>
  )
}
