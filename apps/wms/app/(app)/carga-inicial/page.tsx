import { redirect } from 'next/navigation'
import { exigirContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import { CargaInicial } from '@/components/inventario/carga-inicial'

export const metadata = { title: 'Carga inicial — WMS LOGISALUD' }

export default async function PaginaCargaInicial() {
  const ctx = await exigirContexto()
  const puedeCargar = ctx.roles.includes('admin_wms')
  const puedeDecidir = ctx.roles.includes('direccion_tecnica')
  if (!puedeCargar && !puedeDecidir) redirect('/')
  const repo = repositorio()
  const [decision, cargas] = await Promise.all([repo.estadoCargaInicial(), repo.listarCargasIniciales()])
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header>
        <h1 className="font-heading text-3xl font-semibold uppercase tracking-wide text-gray-900">Carga inicial</h1>
        <p className="mt-1 text-gray-600">El inventario general de Odoo entra una sola vez al libro mayor. Administración lo carga; Dirección Técnica decide en qué estado entra. Mientras el WMS opera en paralelo a Odoo, esto se hace con datos de prueba.</p>
      </header>
      <CargaInicial decision={decision} cargas={cargas} puedeCargar={puedeCargar} puedeDecidir={puedeDecidir} />
    </div>
  )
}
