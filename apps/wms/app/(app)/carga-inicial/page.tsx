import { redirect } from 'next/navigation'
import { exigirContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import { puedeConfirmarCargaInicial, puedeSubirCargaInicial } from '@/domain/carga-inicial'
import { CargaInicial } from '@/components/inventario/carga-inicial'

export const metadata = { title: 'Carga inicial — WMS LOGISALUD' }

export default async function PaginaCargaInicial() {
  const ctx = await exigirContexto()
  const puedeCargar = puedeSubirCargaInicial(ctx.roles)
  const puedeConfirmar = puedeConfirmarCargaInicial(ctx.roles)
  if (!puedeCargar) redirect('/')
  const repo = repositorio()
  const cargas = await repo.listarCargasIniciales()
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header>
        <h1 className="font-heading text-3xl font-semibold uppercase tracking-wide text-gray-900">Carga inicial</h1>
        <p className="mt-1 text-gray-600">El inventario general de Odoo entra una sola vez al libro mayor. Administración lo sube y lo revisa; Dirección Técnica lo valida con una sola confirmación. Mientras el WMS opera en paralelo a Odoo, esto se hace con datos de prueba.</p>
      </header>
      <CargaInicial cargas={cargas} puedeCargar={puedeCargar} puedeConfirmar={puedeConfirmar} />
    </div>
  )
}
