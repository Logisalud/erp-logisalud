import { exigirContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import { RepositorioDocumentosVista } from '@/components/documentos/repositorio-documentos'

export const metadata = { title: 'Documentos regulatorios — WMS LOGISALUD' }

export default async function Documentos() {
  const ctx = await exigirContexto()
  const panorama = await repositorio().panoramaDocumentos()
  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <header>
        <h1 className="font-heading text-3xl font-semibold uppercase tracking-wide text-gray-900">Documentos regulatorios</h1>
        <p className="mt-1 max-w-3xl text-gray-600">El COA de cada lote, el registro sanitario de cada producto y el BPM de cada fabricante, con su vigencia. Cuando un documento se reemplaza, el anterior queda en el historial: nada se borra.</p>
      </header>
      <RepositorioDocumentosVista panorama={panorama} roles={ctx.roles} />
    </div>
  )
}
