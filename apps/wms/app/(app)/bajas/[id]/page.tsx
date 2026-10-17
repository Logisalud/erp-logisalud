import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { notFound } from 'next/navigation'
import { exigirContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import { puedeTrasladarBaja } from '@/domain/bajas'
import { DetalleBaja } from '@/components/bajas/detalle-baja'

export const metadata = { title: 'Orden de Baja — WMS LOGISALUD' }
export const dynamic = 'force-dynamic'

export default async function DetalleDeBaja({ params, searchParams }: { params: { id: string }; searchParams: { nueva?: string } }) {
  const ctx = await exigirContexto()
  const repo = repositorio()
  const orden = await repo.obtenerBaja(params.id)
  if (!orden) notFound()
  const ubicaciones = orden.estado === 'EMITIDA' && !orden.traslado && puedeTrasladarBaja(ctx.roles) ? await repo.ubicacionesDeBajas(orden.propietarioId) : []
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Link href="/bajas" className="inline-flex min-h-10 items-center gap-1.5 text-sm text-gray-700 hover:underline"><ArrowLeft className="h-4 w-4" aria-hidden />Bajas</Link>
      <DetalleBaja orden={orden} roles={ctx.roles} usuarioId={ctx.usuario.id} ubicaciones={ubicaciones} recienSolicitada={searchParams.nueva === '1' && orden.estado === 'SOLICITADA'} />
    </div>
  )
}
