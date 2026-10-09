import type { ReactNode } from 'react'
import { etiquetaRoles, exigirContexto } from '@/lib/contexto'
import { puede } from '@/domain/permisos'
import { Shell, type ItemNav } from '@/components/shell'
import { Salir } from '@/components/salir'
import { repositorio } from '@/services/repositorio-actual'

export const dynamic = 'force-dynamic'

export default async function LayoutApp({ children }: { children: ReactNode }) {
  const ctx = await exigirContexto()
  const alertas = await repositorio().contarAlertasAbiertas()
  const misAlertas = (ctx.roles.includes('direccion_tecnica') ? alertas.direccion_tecnica : 0) + (ctx.roles.some((r) => r === 'jefe_almacen' || r === 'reemplazo_jefe') ? alertas.jefe_almacen : 0) + (ctx.roles.includes('asistente_dt') ? alertas.asistente_dt : 0)
  const items: ItemNav[] = [
    { href: '/', etiqueta: 'Inicio', icono: 'inicio' },
    { href: '/almacen', etiqueta: 'Almacén', icono: 'almacen' },
    { href: '/entradas', etiqueta: 'Entradas', icono: 'entradas' },
    { href: '/movimientos', etiqueta: 'Movimientos', icono: 'movimientos' },
    { href: '/conteos', etiqueta: 'Conteos', icono: 'conteos' },
    { href: '/revision-diaria', etiqueta: 'Revisión diaria', icono: 'revision' },
    { href: '/kardex', etiqueta: 'Kardex', icono: 'kardex' },
    { href: '/productos', etiqueta: 'Productos', icono: 'productos' },
    { href: '/calidad', etiqueta: 'Calidad', icono: 'calidad' },
    { href: '/alertas', etiqueta: 'Alertas', icono: 'alertas', insignia: misAlertas },
    { href: '/expedientes', etiqueta: 'Expedientes', icono: 'expedientes' },
    { href: '/reportes', etiqueta: 'Reportes', icono: 'reportes' },
  ]
  if (ctx.roles.includes('admin_wms') || ctx.roles.includes('direccion_tecnica')) items.push({ href: '/carga-inicial', etiqueta: 'Carga inicial', icono: 'carga' })
  if (ctx.roles.some((r) => r !== 'auxiliar')) items.push({ href: '/propietarios', etiqueta: 'Propietarios', icono: 'propietarios' })
  if (puede(ctx.roles, 'auditar')) items.push({ href: '/auditoria', etiqueta: 'Auditoría', icono: 'auditoria' })
  return (
    <Shell items={items} nombre={ctx.usuario.nombre} rol={etiquetaRoles(ctx.roles)} salir={<Salir demo={ctx.demo} />}>
      {children}
    </Shell>
  )
}
