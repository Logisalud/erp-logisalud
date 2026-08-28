import { redirect } from 'next/navigation'
import { Encabezado } from '@/components/nav'
import { perfilActual } from '@logisalud/auth/server'
import { listarUsuarios } from '@/services/usuarios'
import { FormularioFondo } from './formulario'

export const dynamic = 'force-dynamic'

export default async function NuevoFondo() {
  const perfil = await perfilActual()
  if (perfil?.area !== 'contabilidad' && perfil?.area !== 'admin') redirect('/caja-chica')

  const usuarios = await listarUsuarios()

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Encabezado titulo="Abrir fondo de caja chica" atras={{ href: '/caja-chica', texto: 'Caja Chica' }} />
      <FormularioFondo usuarios={usuarios} />
    </main>
  )
}
