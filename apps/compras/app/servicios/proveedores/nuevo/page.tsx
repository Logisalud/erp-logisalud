import { redirect } from 'next/navigation'
import { Encabezado } from '@/components/nav'
import { perfilActual } from '@logisalud/auth/server'
import { FormularioProveedorServicio } from './formulario'

export const dynamic = 'force-dynamic'

export default async function NuevoProveedorServicio() {
  const perfil = await perfilActual()
  if (perfil?.area !== 'compras' && perfil?.area !== 'contabilidad' && perfil?.area !== 'admin') {
    redirect('/servicios/nueva')
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Encabezado titulo="Registrar proveedor de servicio" atras={{ href: '/servicios/nueva', texto: 'Nueva orden de servicio' }} />
      <FormularioProveedorServicio />
    </main>
  )
}
