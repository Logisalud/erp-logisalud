import type { ReactNode } from 'react'
import { etiquetaCargo, exigirContexto } from '@/lib/contexto'
import { cerradasPorDefecto, construirMenu, principalesTelefono } from '@/domain/menu'
import { Shell } from '@/components/shell'
import { Salir } from '@/components/salir'
import { repositorio } from '@/services/repositorio-actual'

export const dynamic = 'force-dynamic'

export default async function LayoutApp({ children }: { children: ReactNode }) {
  const ctx = await exigirContexto()
  const alertas = await repositorio().contarAlertasAbiertas()
  const misAlertas = (ctx.roles.includes('direccion_tecnica') ? alertas.direccion_tecnica : 0) + (ctx.roles.some((r) => r === 'jefe_almacen') ? alertas.jefe_almacen : 0) + (ctx.roles.includes('asistente_dt') ? alertas.asistente_dt : 0) + (ctx.roles.includes('jefe_transporte') ? alertas.jefe_transporte : 0)
  const secciones = construirMenu(ctx.roles, misAlertas)
  return (
    <Shell secciones={secciones} principales={principalesTelefono(ctx.roles, secciones)} cerradas={cerradasPorDefecto(ctx.roles, secciones)} nombre={ctx.usuario.nombre} rol={etiquetaCargo(ctx)} salir={<Salir demo={ctx.demo} />}>
      {children}
    </Shell>
  )
}
