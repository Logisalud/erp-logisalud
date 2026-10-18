import type { ReactNode } from 'react'
import { etiquetaCargo, exigirContexto } from '@/lib/contexto'
import { puede } from '@/domain/permisos'
import { puedeVerBandeja } from '@/domain/pedidos-despacho'
import { puedeVerRutas } from '@/domain/rutas'
import { puedeOriginarRetorno } from '@/domain/retornos'
import { puedeDarConformidad, puedePickear, puedeVerSalidas } from '@/domain/despacho'
import { Shell, type ItemNav } from '@/components/shell'
import { Salir } from '@/components/salir'
import { repositorio } from '@/services/repositorio-actual'

export const dynamic = 'force-dynamic'

export default async function LayoutApp({ children }: { children: ReactNode }) {
  const ctx = await exigirContexto()
  const alertas = await repositorio().contarAlertasAbiertas()
  const misAlertas = (ctx.roles.includes('direccion_tecnica') ? alertas.direccion_tecnica : 0) + (ctx.roles.some((r) => r === 'jefe_almacen') ? alertas.jefe_almacen : 0) + (ctx.roles.includes('asistente_dt') ? alertas.asistente_dt : 0) + (ctx.roles.includes('jefe_transporte') ? alertas.jefe_transporte : 0)
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
    { href: '/documentos', etiqueta: 'Documentos', icono: 'documentos' },
    { href: '/expedientes', etiqueta: 'Expedientes', icono: 'expedientes' },
    { href: '/reportes', etiqueta: 'Reportes', icono: 'reportes' },
  ]
  if (puedeVerBandeja(ctx.roles)) items.splice(4, 0, { href: '/pedidos', etiqueta: 'Pedidos', icono: 'pedidos' })
  if (puedeVerRutas(ctx.roles)) items.splice(5, 0, { href: '/rutas', etiqueta: 'Rutas', icono: 'rutas' })
  if (puedeVerSalidas(ctx.roles)) {
    items.splice(6, 0, { href: '/salidas', etiqueta: 'Salidas', icono: 'salidas' })
    if (puedePickear(ctx.roles)) items.splice(7, 0, { href: '/picking', etiqueta: 'Picking', icono: 'picking' })
    if (puedeDarConformidad(ctx.roles)) items.splice(8, 0, { href: '/conformidad', etiqueta: 'Conformidad', icono: 'conformidad' })
    items.splice(items.findIndex((i) => i.href === '/picking' || i.href === '/salidas') + 1 + (puedePickear(ctx.roles) ? 1 : 0) + (puedeDarConformidad(ctx.roles) ? 1 : 0), 0, { href: '/embalaje', etiqueta: 'Embalaje', icono: 'embalaje' })
    items.splice(items.findIndex((i) => i.href === '/embalaje') + 1, 0, { href: '/carga', etiqueta: 'Carga de unidad', icono: 'cargaunidad' })
  }
  items.splice(items.findIndex((i) => i.href === '/calidad') + 1, 0, { href: '/bajas', etiqueta: 'Bajas', icono: 'bajas' })
  if (puedeOriginarRetorno(ctx.roles)) items.splice(items.findIndex((i) => i.href === '/entradas') + 1, 0, { href: '/retornos', etiqueta: 'Retornos', icono: 'retornos' })
  if (ctx.roles.includes('admin_wms') || ctx.roles.includes('direccion_tecnica')) items.push({ href: '/carga-inicial', etiqueta: 'Carga inicial', icono: 'carga' })
  if (ctx.roles.some((r) => r !== 'auxiliar')) items.push({ href: '/propietarios', etiqueta: 'Propietarios', icono: 'propietarios' })
  if (puede(ctx.roles, 'auditar')) items.push({ href: '/auditoria', etiqueta: 'Auditoría', icono: 'auditoria' })
  return (
    <Shell items={items} nombre={ctx.usuario.nombre} rol={etiquetaCargo(ctx)} salir={<Salir demo={ctx.demo} />}>
      {children}
    </Shell>
  )
}
