import Link from 'next/link'
import {
  ArrowRight, Boxes, CheckCircle2, Clock, FilePlus2, Hourglass, Map, MessageSquareWarning, ShieldAlert, ShieldCheck, TriangleAlert, type LucideIcon,
} from 'lucide-react'
import { exigirContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import {
  alertasRegulatorias, ocupacionPorPropietario, unidadesEnEstado, unidadesPorTrasladar, type Panorama,
} from '@/domain/panorama'
import { puede, puedeCrearProducto, puedeValidarProducto } from '@/domain/permisos'
import type { Rol } from '@/domain/tipos'
import { vistaPropietario } from '@/components/propietarios-color'
import { formatoFecha } from '@/domain/fechas'

export const metadata = { title: 'Inicio — WMS LOGISALUD' }

const pl = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios)

interface Aviso {
  clave: string
  Icono: LucideIcon
  texto: string
  detalle?: string
  cantidad: number
  unidad: string
  href: string
  tono: 'atencion' | 'info'
}

function avisosPara(roles: Rol[], p: Panorama): Aviso[] {
  const a = alertasRegulatorias(p)
  const avisos: Aviso[] = []
  const porVerificar = p.posiciones.filter((x) => x.porVerificar).length
  const trasladar = unidadesPorTrasladar(p)
  const docsPorConfirmar = p.documentos.filter((d) => d.estadoConfirmacion === 'POR_CONFIRMAR')

  if (puedeValidarProducto(roles) && a.pendientesDeValidar.length > 0) {
    avisos.push({ clave: 'validar', Icono: Clock, texto: 'Productos esperando tu validación', detalle: 'Sandra ya cargó su registro sanitario.', cantidad: a.pendientesDeValidar.length, unidad: pl(a.pendientesDeValidar.length, 'producto', 'productos'), href: '/productos?validacion=PENDIENTE', tono: 'atencion' })
  }
  if (puedeCrearProducto(roles) && !puedeValidarProducto(roles) && a.observados.length > 0) {
    avisos.push({ clave: 'observados', Icono: MessageSquareWarning, texto: 'Productos devueltos con observación', detalle: 'Corrígelos para que Dirección Técnica los valide.', cantidad: a.observados.length, unidad: pl(a.observados.length, 'producto', 'productos'), href: '/productos?validacion=OBSERVADO', tono: 'atencion' })
  }
  if ((puedeCrearProducto(roles) || puedeValidarProducto(roles)) && a.vencidos.length > 0) {
    avisos.push({ clave: 'rs-vencido', Icono: ShieldAlert, texto: 'Registros sanitarios vencidos', detalle: 'Sus lotes no se pueden aprobar hasta resolverlo.', cantidad: a.vencidos.length, unidad: pl(a.vencidos.length, 'producto', 'productos'), href: '/productos?rs=VENCIDO', tono: 'atencion' })
  }
  if ((puedeCrearProducto(roles) || puedeValidarProducto(roles)) && a.porVencer.length > 0) {
    avisos.push({ clave: 'rs-por-vencer', Icono: Clock, texto: 'Registros sanitarios por vencer (90 días)', cantidad: a.porVencer.length, unidad: pl(a.porVencer.length, 'producto', 'productos'), href: '/productos?rs=POR_VENCER', tono: 'info' })
  }
  if (puedeCrearProducto(roles) && a.sinRegistro.length > 0) {
    avisos.push({ clave: 'sin-registro', Icono: FilePlus2, texto: 'Productos sin registro sanitario cargado', cantidad: a.sinRegistro.length, unidad: pl(a.sinRegistro.length, 'producto', 'productos'), href: '/productos?rs=SIN_DATO', tono: 'atencion' })
  }
  if (roles.some((r) => ['jefe_almacen', 'reemplazo_jefe', 'auxiliar', 'direccion_tecnica'].includes(r)) && trasladar > 0) {
    avisos.push({ clave: 'trasladar', Icono: ShieldCheck, texto: 'Aprobados esperando su traslado a un rack', detalle: 'Siguen en la zona de Cuarentena.', cantidad: trasladar, unidad: pl(trasladar, 'unidad', 'unidades'), href: '/almacen?capa=estado', tono: 'atencion' })
  }
  if (roles.some((r) => ['jefe_almacen', 'reemplazo_jefe', 'admin_wms'].includes(r)) && porVerificar > 0) {
    avisos.push({ clave: 'verificar', Icono: TriangleAlert, texto: 'Ubicaciones por verificar en sitio', detalle: 'Aparecen en los planos o en Odoo pero faltan en la tabla de propietarios.', cantidad: porVerificar, unidad: pl(porVerificar, 'ubicación', 'ubicaciones'), href: '/almacen?capa=verificar', tono: 'atencion' })
  }
  if (roles.includes('admin_wms') && docsPorConfirmar.length > 0) {
    avisos.push({ clave: 'docs', Icono: ShieldAlert, texto: 'Documentos de sustento por confirmar', detalle: docsPorConfirmar.map((d) => d.titulo).join(' · '), cantidad: docsPorConfirmar.length, unidad: docsPorConfirmar.length === 1 ? 'documento' : 'documentos', href: '/propietarios', tono: 'atencion' })
  }
  return avisos
}

export default async function Inicio() {
  const ctx = await exigirContexto()
  const repo = repositorio()
  const p = await repo.panorama()
  const avisos = avisosPara(ctx.roles, p)
  const ocup = ocupacionPorPropietario(p).sort((a, b) => b.posiciones - a.posiciones)
  const eventos = puede(ctx.roles, 'auditar') ? (await repo.auditoria(5)) : []
  const u = {
    aprobado: unidadesEnEstado(p, 'APROBADO'), cuarentena: unidadesEnEstado(p, 'CUARENTENA'), bajas: unidadesEnEstado(p, 'BAJAS_RECHAZADOS'),
  }
  const num = (n: number) => n.toLocaleString('es-PE')

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-heading text-3xl font-semibold uppercase tracking-wide text-gray-900">Inicio</h1>
        <p className="mt-1 text-gray-600">{formatoFecha(p.hoy)}</p>
      </header>

      <section aria-labelledby="atencion" data-testid="atencion">
        <h2 id="atencion" className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">Qué necesita atención</h2>
        {avisos.length === 0 ? (
          <div className="mt-3 flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-4 text-green-900" data-testid="todo-en-orden">
            <CheckCircle2 className="h-6 w-6 shrink-0" aria-hidden />
            <div>
              <p className="font-medium">Todo en orden</p>
              <p className="text-sm">No hay nada pendiente para ti ahora. Puedes buscar un producto o recorrer el almacén.</p>
            </div>
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-gray-200 overflow-hidden rounded-lg border border-gray-200 bg-white">
            {avisos.map((a) => (
              <li key={a.clave}>
                <Link href={a.href} className="flex min-h-16 items-center gap-4 px-4 py-3 transition duration-fast hover:bg-gray-50">
                  <a.Icono className={`h-6 w-6 shrink-0 ${a.tono === 'atencion' ? 'text-amber-600' : 'text-gray-500'}`} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-gray-900">{a.texto}</span>
                    {a.detalle && <span className="block truncate text-sm text-gray-600">{a.detalle}</span>}
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="tabular block font-heading text-2xl font-semibold text-gray-900">{num(a.cantidad)}</span>
                    <span className="block text-xs text-gray-600">{a.unidad}</span>
                  </span>
                  <ArrowRight className="hidden h-4 w-4 shrink-0 text-gray-400 md:block" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="almacen-hoy" className="grid gap-8 lg:grid-cols-2">
        <div>
          <h2 id="almacen-hoy" className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">Unidades por estado</h2>
          <dl className="mt-3 divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white">
            <div className="flex min-h-14 items-center justify-between px-4">
              <dt className="flex items-center gap-2 text-sm text-gray-800"><ShieldCheck className="h-4 w-4 text-green-700" aria-hidden />Aprobado</dt>
              <dd className="tabular font-medium">{num(u.aprobado)}</dd>
            </div>
            <div className="flex min-h-14 items-center justify-between px-4">
              <dt className="flex items-center gap-2 text-sm text-gray-800"><Hourglass className="h-4 w-4 text-indigo-700" aria-hidden />Cuarentena</dt>
              <dd className="tabular font-medium">{num(u.cuarentena)}</dd>
            </div>
            <div className="flex min-h-14 items-center justify-between px-4">
              <dt className="flex items-center gap-2 text-sm text-gray-800"><span className="inline-block h-4 w-4 rounded-full border-2 border-red-700" aria-hidden />Bajas/Rechazados</dt>
              <dd className="tabular font-medium">{num(u.bajas)}</dd>
            </div>
          </dl>
          <p className="mt-2 text-xs text-gray-600">Cada estado se cuenta por unidad, no por lote: un mismo lote puede tener unidades en dos estados.</p>
        </div>

        <div>
          <h2 className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">Ubicaciones usadas por propietario</h2>
          <ul className="mt-3 space-y-3 rounded-lg border border-gray-200 bg-white p-4">
            {ocup.map((o) => {
              const v = vistaPropietario(o.propietario.codigo)
              const pct = o.posiciones ? Math.round((o.conStock / o.posiciones) * 100) : 0
              return (
                <li key={o.propietario.id}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="flex items-center gap-2 font-medium text-gray-900">
                      <span aria-hidden className="flex h-6 w-6 items-center justify-center rounded text-xs font-bold text-white" style={{ background: v.color }}>{v.letra}</span>
                      {v.corto}
                    </span>
                    <span className="tabular text-gray-600">{o.conStock} de {o.posiciones} con stock</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-gray-100" role="img" aria-label={`${pct}% de sus ubicaciones tienen stock`}>
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: v.color }} />
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      </section>

      {eventos.length > 0 && (
        <section aria-labelledby="ultimos">
          <h2 id="ultimos" className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">Lo último en la auditoría</h2>
          <ul className="mt-3 divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white text-sm">
            {eventos.map((e) => (
              <li key={e.id} className="flex flex-wrap items-baseline gap-x-3 px-4 py-3">
                <span className="font-medium text-gray-900">{e.actor}</span>
                <span className="text-gray-700">{e.detalle ?? e.evento}</span>
                <span className="ml-auto text-xs text-gray-500">{formatoFecha(e.ts.slice(0, 10))}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="atajos">
        <h2 id="atajos" className="sr-only">Atajos</h2>
        <div className="flex flex-wrap gap-3">
          <Link href="/almacen" className="btn-primary"><Map className="h-5 w-5" aria-hidden />Ver el almacén</Link>
          <Link href="/productos" className="btn-secondary"><Boxes className="h-5 w-5" aria-hidden />Productos</Link>
          {puedeCrearProducto(ctx.roles) && <Link href="/productos/nuevo" className="btn-secondary"><FilePlus2 className="h-5 w-5" aria-hidden />Dar de alta un producto</Link>}
        </div>
      </section>
    </div>
  )
}
