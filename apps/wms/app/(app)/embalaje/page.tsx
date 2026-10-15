import { Lock } from 'lucide-react'
import { exigirContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import { puedeVerSalidas } from '@/domain/despacho'
import { ColaEmbalaje } from '@/components/embalaje/cola-embalaje'

export const metadata = { title: 'Embalaje — WMS LOGISALUD' }

export default async function Embalaje() {
  const ctx = await exigirContexto()
  if (!puedeVerSalidas(ctx.roles)) return <div className="mx-auto max-w-2xl rounded-lg border border-gray-200 bg-white px-6 py-12 text-center" data-testid="salidas-sin-permiso"><Lock className="mx-auto h-9 w-9 text-gray-400" aria-hidden /><p className="mt-3 text-gray-700">El embalaje es del personal de almacén y transporte.</p></div>
  const pedidos = await repositorio().colaEmbalaje()
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header><h1 className="font-heading text-3xl font-semibold uppercase tracking-wide text-gray-900">Embalaje</h1><p className="mt-1 max-w-3xl text-gray-600">Los pedidos con la conformidad completa se reparten en bultos «1 de 3», cada uno con su etiqueta y su código QR.</p></header>
      <ColaEmbalaje pedidos={pedidos} />
    </div>
  )
}
