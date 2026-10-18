import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Lock } from 'lucide-react'
import { exigirContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import { puedeOriginarRetorno } from '@/domain/retornos'
import { puedePrepararSolicitud } from '@/domain/entradas'
import { FormRetorno } from '@/components/retornos/form-retorno'

export const metadata = { title: 'Registrar un retorno — WMS LOGISALUD' }

export default async function RetornoDeSalida({ params }: { params: { id: string } }) {
  const ctx = await exigirContexto()
  if (!puedeOriginarRetorno(ctx.roles)) {
    return <div className="mx-auto max-w-2xl rounded-lg border border-gray-200 bg-white px-6 py-12 text-center" data-testid="retornos-sin-permiso"><Lock className="mx-auto h-9 w-9 text-gray-400" aria-hidden /><p className="mt-3 text-gray-700">Los retornos los registran Sandra, Dirección Técnica y los jefes de Almacén y de Transporte.</p></div>
  }
  const salida = await repositorio().salidaParaRetorno(decodeURIComponent(params.id))
  if (!salida) notFound()
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/retornos" className="inline-flex min-h-10 items-center gap-1.5 text-sm text-gray-700 hover:underline"><ArrowLeft className="h-4 w-4" aria-hidden />Retornos</Link>
      <FormRetorno salida={salida} puedeAutorizar={puedePrepararSolicitud(ctx.roles)} />
    </div>
  )
}
