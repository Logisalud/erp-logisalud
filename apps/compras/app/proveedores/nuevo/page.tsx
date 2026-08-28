import { redirect } from 'next/navigation'
import { Encabezado } from '@/components/nav'
import { perfilActual } from '@logisalud/auth/server'
import { FormularioProveedor } from './formulario'

export const dynamic = 'force-dynamic'

export default async function NuevoProveedor() {
  const perfil = await perfilActual()
  if (perfil?.area !== 'compras' && perfil?.area !== 'admin') redirect('/proveedores')

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Encabezado titulo="Registrar proveedor" atras={{ href: '/proveedores', texto: 'Proveedores' }} />
      <FormularioProveedor />
    </main>
  )
}
