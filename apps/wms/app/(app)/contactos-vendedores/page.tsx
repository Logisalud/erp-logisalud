import { redirect } from 'next/navigation'
import { exigirContexto } from '@/lib/contexto'
import { puede } from '@/domain/permisos'
import { repositorio } from '@/services/repositorio-actual'
import { ConfigSeguimiento } from '@/components/seguimiento/config-seguimiento'

export const metadata = { title: 'Seguimiento a clientes — WMS LOGISALUD' }

export default async function SeguimientoClientes() {
  const ctx = await exigirContexto()
  if (!puede(ctx.roles, 'configurar')) redirect('/')
  const repo = repositorio()
  const [contactos, opciones] = await Promise.all([repo.listarContactosVendedores(), repo.opcionesSeguimiento()])
  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-heading text-3xl font-semibold uppercase tracking-wide text-gray-900">Seguimiento a clientes</h1>
        <p className="mt-1 max-w-3xl text-gray-600">A quién escribe el cliente desde la pantalla de seguimiento de su pedido, y qué muestra esa pantalla.</p>
      </header>
      <ConfigSeguimiento contactos={contactos} opciones={opciones} />
    </div>
  )
}
