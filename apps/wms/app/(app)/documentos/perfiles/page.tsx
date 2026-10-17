import { Lock } from 'lucide-react'
import { exigirContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import { puedeDefinirPerfiles } from '@/domain/documentos'
import { PerfilesDocumentalesVista } from '@/components/documentos/perfiles-documentales'

export const metadata = { title: 'Qué pide cada cliente — WMS LOGISALUD' }

export default async function Perfiles() {
  const ctx = await exigirContexto()
  if (!puedeDefinirPerfiles(ctx.roles)) {
    return (
      <div className="mx-auto max-w-2xl rounded-lg border border-gray-200 bg-white px-6 py-12 text-center" data-testid="perfiles-sin-permiso">
        <Lock className="mx-auto h-9 w-9 text-gray-400" aria-hidden />
        <h1 className="mt-3 font-heading text-2xl font-semibold uppercase tracking-wide text-gray-900">Qué pide cada cliente</h1>
        <p className="mt-2 text-gray-700">Estas reglas las define Dirección Técnica o el Jefe de Transporte.</p>
      </div>
    )
  }
  const { perfiles } = await repositorio().panoramaDocumentos()
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <header><h1 className="font-heading text-3xl font-semibold uppercase tracking-wide text-gray-900">Qué pide cada cliente</h1></header>
      <PerfilesDocumentalesVista perfiles={perfiles} />
    </div>
  )
}
