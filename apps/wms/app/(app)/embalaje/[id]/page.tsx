import { notFound } from 'next/navigation'
import { Lock } from 'lucide-react'
import { exigirContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import { puedeVerSalidas } from '@/domain/despacho'
import { puedeEmbalar } from '@/domain/embalaje'
import { EditorEmbalaje } from '@/components/embalaje/editor-embalaje'

export const metadata = { title: 'Embalaje — WMS LOGISALUD' }

export default async function EmbalajePedido({ params }: { params: { id: string } }) {
  const ctx = await exigirContexto()
  if (!puedeVerSalidas(ctx.roles)) return <div className="mx-auto max-w-2xl rounded-lg border border-gray-200 bg-white px-6 py-12 text-center" data-testid="salidas-sin-permiso"><Lock className="mx-auto h-9 w-9 text-gray-400" aria-hidden /><p className="mt-3 text-gray-700">No tienes acceso al embalaje.</p></div>
  const embalaje = await repositorio().embalajeSalida(params.id)
  if (!embalaje) notFound()
  return <div className="mx-auto max-w-5xl"><EditorEmbalaje key={embalaje.bultos} embalaje={embalaje} puedeEmbalar={puedeEmbalar(ctx.roles)} /></div>
}
