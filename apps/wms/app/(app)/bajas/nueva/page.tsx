import Link from 'next/link'
import { ArrowLeft, Lock } from 'lucide-react'
import { exigirContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import { puedeSolicitarBaja } from '@/domain/bajas'
import { FormNuevaBaja } from '@/components/bajas/form-nueva-baja'

export const metadata = { title: 'Nueva baja — WMS LOGISALUD' }

export default async function NuevaBaja({ searchParams }: { searchParams: { q?: string; propietario?: string } }) {
  const ctx = await exigirContexto()
  if (!puedeSolicitarBaja(ctx.roles)) {
    return (
      <div className="mx-auto max-w-2xl rounded-lg border border-gray-200 bg-white px-6 py-12 text-center" data-testid="bajas-sin-permiso">
        <Lock className="mx-auto h-9 w-9 text-gray-400" aria-hidden />
        <p className="mt-3 text-gray-700">Pedir una baja es de Dirección Técnica, su asistente y el Jefe de Almacén.</p>
        <Link href="/bajas" className="btn-secondary mt-4 inline-flex">Volver a Bajas</Link>
      </div>
    )
  }
  const panorama = await repositorio().panorama()
  const propietarios = panorama.propietarios.map((p) => ({ id: p.id, codigo: p.codigo, razonSocial: p.razonSocial, esDuenoAlmacen: p.esDuenoAlmacen }))
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <Link href="/bajas" className="inline-flex min-h-10 items-center gap-1.5 text-sm text-gray-700 hover:underline"><ArrowLeft className="h-4 w-4" aria-hidden />Bajas</Link>
      <header>
        <h1 className="font-heading text-3xl font-semibold uppercase tracking-wide text-gray-900">Nueva baja</h1>
        <p className="mt-1 max-w-3xl text-gray-700">Elige de quién es el stock, busca lo que se da de baja y cuéntanos el motivo. Después reúnes el sustento y Dirección Técnica autoriza.</p>
      </header>
      <FormNuevaBaja propietarios={propietarios} propietarioInicial={searchParams.propietario} consultaInicial={searchParams.q ?? ''} />
    </div>
  )
}
