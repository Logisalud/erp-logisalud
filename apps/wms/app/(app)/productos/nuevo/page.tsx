import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { exigirContexto } from '@/lib/contexto'
import { puedeCrearProducto } from '@/domain/permisos'
import { FormProducto } from '@/components/form-producto'

export const metadata = { title: 'Dar de alta un producto — WMS LOGISALUD' }

export default async function NuevoProducto() {
  const ctx = await exigirContexto()
  if (!puedeCrearProducto(ctx.roles)) redirect('/productos')
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href="/productos" className="inline-flex min-h-10 items-center gap-1.5 text-sm text-gray-700 hover:underline"><ArrowLeft className="h-4 w-4" aria-hidden />Productos</Link>
      <header>
        <h1 className="font-heading text-3xl font-semibold uppercase tracking-wide text-gray-900">Dar de alta un producto</h1>
        <p className="mt-1 text-gray-600">Solo falta lo esencial. El maestro es el mismo de Compras: aquí no se duplica nada.</p>
      </header>
      <div className="card"><FormProducto /></div>
    </div>
  )
}
