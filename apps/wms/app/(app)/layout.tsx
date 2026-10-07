import type { ReactNode } from 'react'
import { etiquetaRoles, exigirContexto } from '@/lib/contexto'
import { puede } from '@/domain/permisos'
import { Shell, type ItemNav } from '@/components/shell'
import { Salir } from '@/components/salir'

export const dynamic = 'force-dynamic'

export default async function LayoutApp({ children }: { children: ReactNode }) {
  const ctx = await exigirContexto()
  const items: ItemNav[] = [
    { href: '/', etiqueta: 'Inicio', icono: 'inicio' },
    { href: '/almacen', etiqueta: 'Almacén', icono: 'almacen' },
    { href: '/productos', etiqueta: 'Productos', icono: 'productos' },
  ]
  if (ctx.roles.some((r) => r !== 'auxiliar')) items.push({ href: '/propietarios', etiqueta: 'Propietarios', icono: 'propietarios' })
  if (puede(ctx.roles, 'auditar')) items.push({ href: '/auditoria', etiqueta: 'Auditoría', icono: 'auditoria' })
  return (
    <Shell items={items} nombre={ctx.usuario.nombre} rol={etiquetaRoles(ctx.roles)} salir={<Salir demo={ctx.demo} />}>
      {children}
    </Shell>
  )
}
