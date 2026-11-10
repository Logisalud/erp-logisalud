import { redirect } from 'next/navigation'
import { exigirContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import { puedeVerProveedores, puedeMarcarProveedores } from '@/domain/vencimiento'
import { ListaProveedores } from '@/components/proveedores/lista-proveedores'

export const metadata = { title: 'Proveedores — WMS LOGISALUD' }

export default async function Proveedores() {
  const ctx = await exigirContexto()
  if (!puedeVerProveedores(ctx.roles)) redirect('/')
  const proveedores = await repositorio().proveedoresVencimiento()
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <header>
        <h1 className="font-heading text-3xl font-semibold uppercase tracking-wide text-gray-900">Proveedores</h1>
        <p className="mt-1 max-w-3xl text-gray-600">Los proveedores vienen de Compras (solo se leen). Aquí marcas a los que imprimen solo mes y año en sus productos, como Daré Pharma: al recibir sus productos, el sistema pide verificar la fecha de vencimiento en el envase.</p>
      </header>
      <ListaProveedores proveedores={proveedores} puedeMarcar={puedeMarcarProveedores(ctx.roles)} />
    </div>
  )
}
