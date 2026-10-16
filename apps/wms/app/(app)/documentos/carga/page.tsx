import { Lock } from 'lucide-react'
import { exigirContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import { puedeCargarCoaEnBloque } from '@/domain/documentos'
import { CargaCoaVista } from '@/components/documentos/carga-coa'

export const metadata = { title: 'Cargar COA en bloque — WMS LOGISALUD' }

export default async function CargaCoa() {
  const ctx = await exigirContexto()
  if (!puedeCargarCoaEnBloque(ctx.roles)) {
    return (
      <div className="mx-auto max-w-2xl rounded-lg border border-gray-200 bg-white px-6 py-12 text-center" data-testid="carga-sin-permiso">
        <Lock className="mx-auto h-9 w-9 text-gray-400" aria-hidden />
        <h1 className="mt-3 font-heading text-2xl font-semibold uppercase tracking-wide text-gray-900">Cargar COA en bloque</h1>
        <p className="mt-2 text-gray-700">Esta carga es para Dirección Técnica, su asistente y el Jefe de Almacén. Si la necesitas, pídele acceso al administrador del WMS.</p>
      </div>
    )
  }
  const { itemsCoa } = await repositorio().panoramaDocumentos()
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <header><h1 className="font-heading text-3xl font-semibold uppercase tracking-wide text-gray-900">Cargar COA en bloque</h1></header>
      <CargaCoaVista items={itemsCoa} />
    </div>
  )
}
