import Link from 'next/link'
import {
  ArrowLeftRight, ArrowRight, Bell, Boxes, ClipboardCheck, CheckCircle2, ClipboardList, Clock, FilePlus2, FolderOpen, Hourglass, Inbox, Map, MessageSquareWarning, PenLine, ShieldAlert, ShieldCheck, TriangleAlert, Undo2, type LucideIcon,
} from 'lucide-react'
import { exigirContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import {
  alertasRegulatorias, ocupacionPorPropietario, unidadesEnEstado, unidadesPorTrasladar, type Panorama,
} from '@/domain/panorama'
import { puede, puedeCrearProducto, puedeEditarRegulatorio } from '@/domain/permisos'
import { puedePrepararSolicitud } from '@/domain/entradas'
import { accionesDeOrden } from '@/domain/inventario'
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

interface DatosEntradas {
  porAutorizar: number
  porLlegar: number
  enProceso: number
  porFirmar: number
  porRegistrarEnCompras: number
  organolepticasPendientes: number
  organolepticasPorLlenar: number
  expedientesConFaltantes: number
  alertasMias: number
  movimientosParaMi: number
  conteosAbiertos: number
  ajustesPorAutorizar: number
}

function avisosPara(roles: Rol[], p: Panorama, e: DatosEntradas): Aviso[] {
  const a = alertasRegulatorias(p)
  const avisos: Aviso[] = []
  const opera = roles.some((r) => ['jefe_almacen', 'reemplazo_jefe', 'auxiliar', 'asistente_dt'].includes(r))
  if (e.alertasMias > 0) {
    avisos.push({ clave: 'alertas', Icono: Bell, texto: 'Alertas abiertas para ti', detalle: 'Temperatura, registro sanitario, cambios de una solicitud, diferencias con Compras o aprobados sin trasladar.', cantidad: e.alertasMias, unidad: pl(e.alertasMias, 'alerta', 'alertas'), href: '/alertas', tono: 'atencion' })
  }
  if (e.movimientosParaMi > 0) {
    avisos.push({ clave: 'movimientos', Icono: ArrowLeftRight, texto: 'Movimientos internos por atender', detalle: 'Verificar lo que otra persona movió o resolver una diferencia: quien ejecuta no verifica lo suyo.', cantidad: e.movimientosParaMi, unidad: pl(e.movimientosParaMi, 'movimiento', 'movimientos'), href: '/movimientos', tono: 'atencion' })
  }
  if (roles.some((r) => ['jefe_almacen', 'reemplazo_jefe', 'auxiliar'].includes(r)) && e.conteosAbiertos > 0) {
    avisos.push({ clave: 'conteos', Icono: ClipboardCheck, texto: 'Conteos cíclicos abiertos', detalle: 'Cuenta a ciegas; sus ubicaciones no se mueven hasta cerrarlos.', cantidad: e.conteosAbiertos, unidad: pl(e.conteosAbiertos, 'conteo', 'conteos'), href: '/conteos', tono: 'info' })
  }
  if (roles.includes('direccion_tecnica') && e.ajustesPorAutorizar > 0) {
    avisos.push({ clave: 'ajustes', Icono: ShieldAlert, texto: 'Ajustes de inventario esperando tu autorización', detalle: 'Un conteo confirmó una diferencia y el Jefe propone corregirla.', cantidad: e.ajustesPorAutorizar, unidad: pl(e.ajustesPorAutorizar, 'ajuste', 'ajustes'), href: '/conteos', tono: 'atencion' })
  }
  if (roles.includes('direccion_tecnica') && e.organolepticasPendientes > 0) {
    avisos.push({ clave: 'organolepticas', Icono: ClipboardList, texto: 'Actas organolépticas esperando tu decisión', detalle: 'Decide Aprobado o Bajas/Rechazados.', cantidad: e.organolepticasPendientes, unidad: pl(e.organolepticasPendientes, 'acta', 'actas'), href: '/calidad', tono: 'atencion' })
  }
  if (roles.includes('asistente_dt') && e.organolepticasPorLlenar > 0) {
    avisos.push({ clave: 'por-llenar', Icono: ClipboardList, texto: 'Actas organolépticas por llenar', detalle: 'Cuando las termines, se envían a Dirección Técnica.', cantidad: e.organolepticasPorLlenar, unidad: pl(e.organolepticasPorLlenar, 'acta', 'actas'), href: '/calidad', tono: 'atencion' })
  }
  if (roles.includes('asistente_dt') && e.expedientesConFaltantes > 0) {
    avisos.push({ clave: 'expedientes', Icono: FolderOpen, texto: 'Expedientes con documentos faltantes', cantidad: e.expedientesConFaltantes, unidad: pl(e.expedientesConFaltantes, 'expediente', 'expedientes'), href: '/expedientes', tono: 'info' })
  }
  if (puedePrepararSolicitud(roles) && e.porAutorizar > 0) {
    avisos.push({ clave: 'por-autorizar', Icono: FilePlus2, texto: 'Solicitudes de ingreso por autorizar', detalle: 'Autorízalas para que queden programadas ("por llegar").', cantidad: e.porAutorizar, unidad: pl(e.porAutorizar, 'solicitud', 'solicitudes'), href: '/entradas?f=autorizar', tono: 'atencion' })
  }
  if (e.porRegistrarEnCompras > 0 && roles.some((r) => ['jefe_almacen', 'reemplazo_jefe', 'direccion_tecnica', 'asistente_dt'].includes(r))) {
    avisos.push({ clave: 'por-registrar-compras', Icono: ClipboardList, texto: 'Cantidades físicas por registrar en Compras', detalle: 'El WMS ya confirmó lo que llegó; Compras todavía no lo tiene igual. Copia la "Cantidad física confirmada" a la recepción de la OC.', cantidad: e.porRegistrarEnCompras, unidad: pl(e.porRegistrarEnCompras, 'solicitud', 'solicitudes'), href: '/entradas?f=compras', tono: 'atencion' })
  }
  if (opera && e.porLlegar > 0) {
    avisos.push({ clave: 'por-llegar', Icono: Inbox, texto: 'Mercadería por llegar', detalle: 'Solicitudes autorizadas. Empieza la recepción cuando llegue el camión.', cantidad: e.porLlegar, unidad: pl(e.porLlegar, 'solicitud', 'solicitudes'), href: '/entradas?f=llegar', tono: 'info' })
  }
  if (opera && e.porFirmar > 0) {
    avisos.push({ clave: 'por-firmar', Icono: PenLine, texto: 'Recepciones por firmar o confirmar', detalle: 'El acta de recepción espera firmas o la confirmación.', cantidad: e.porFirmar, unidad: pl(e.porFirmar, 'recepción', 'recepciones'), href: '/entradas?f=firmas', tono: 'atencion' })
  }
  if (opera && e.enProceso > 0) {
    avisos.push({ clave: 'en-proceso', Icono: Inbox, texto: 'Recepciones en curso', detalle: 'Falta verificar lo que llegó, completar los datos o generar el acta.', cantidad: e.enProceso, unidad: pl(e.enProceso, 'recepción', 'recepciones'), href: '/entradas?f=proceso', tono: 'info' })
  }
  const porVerificar = p.posiciones.filter((x) => x.porVerificar).length
  const trasladar = unidadesPorTrasladar(p)
  const docsPorConfirmar = p.documentos.filter((d) => d.estadoConfirmacion === 'POR_CONFIRMAR')

  if ((puedeEditarRegulatorio(roles)) && a.vencidos.length > 0) {
    avisos.push({ clave: 'rs-vencido', Icono: ShieldAlert, texto: 'Registros sanitarios vencidos', detalle: 'Sus lotes no se pueden aprobar hasta resolverlo.', cantidad: a.vencidos.length, unidad: pl(a.vencidos.length, 'producto', 'productos'), href: '/productos?rs=VENCIDO', tono: 'atencion' })
  }
  if ((puedeEditarRegulatorio(roles)) && a.porVencer.length > 0) {
    avisos.push({ clave: 'rs-por-vencer', Icono: Clock, texto: 'Registros sanitarios por vencer (90 días)', cantidad: a.porVencer.length, unidad: pl(a.porVencer.length, 'producto', 'productos'), href: '/productos?rs=POR_VENCER', tono: 'info' })
  }
  if (puedeEditarRegulatorio(roles) && a.sinRegistro.length > 0) {
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
  const [p, ingresos, cola, expedientes, conteo, ordenes, conteos, ajustes] = await Promise.all([
    repo.panorama(), repo.listarSolicitudes(), repo.colaDireccionTecnica(), repo.listarExpedientes(), repo.contarAlertasAbiertas(),
    repo.listarMovimientos(), repo.listarConteos(), repo.listarAjustes(),
  ])
  const alertasMias = (ctx.roles.includes('direccion_tecnica') ? conteo.direccion_tecnica : 0) + (ctx.roles.some((r) => r === 'jefe_almacen' || r === 'reemplazo_jefe') ? conteo.jefe_almacen : 0) + (ctx.roles.includes('asistente_dt') ? conteo.asistente_dt : 0)
  const avisos = avisosPara(ctx.roles, p, {
    porAutorizar: ingresos.filter((i) => i.paso === 'POR_AUTORIZAR').length,
    porLlegar: ingresos.filter((i) => i.paso === 'POR_LLEGAR').length,
    enProceso: ingresos.filter((i) => i.paso === 'VERIFICANDO' || i.paso === 'ACTA').length,
    porFirmar: ingresos.filter((i) => i.paso === 'FIRMAS' || i.paso === 'CONFIRMAR').length,
    porRegistrarEnCompras: ingresos.filter((i) => i.registroCompras === 'FALTA' || i.registroCompras === 'NO_COINCIDE').length,
    organolepticasPendientes: cola.organolepticas.length, organolepticasPorLlenar: cola.borradores.length,
    expedientesConFaltantes: expedientes.filter((x) => x.estado === 'ABIERTO' && x.faltantesAbiertos > 0).length, alertasMias,
    movimientosParaMi: ordenes.filter((o) => { const a = accionesDeOrden(o, ctx.usuario.id, ctx.roles); return a.verificar || a.resolver }).length,
    conteosAbiertos: conteos.filter((c) => c.estado !== 'CERRADO').length,
    ajustesPorAutorizar: ajustes.filter((a) => a.estado === 'PROPUESTO').length,
  })
  const ocup = ocupacionPorPropietario(p).sort((a, b) => b.posiciones - a.posiciones)
  const eventos = puede(ctx.roles, 'auditar') ? (await repo.auditoria(5)) : []
  const u = {
    aprobado: unidadesEnEstado(p, 'APROBADO'), cuarentena: unidadesEnEstado(p, 'CUARENTENA'), devoluciones: unidadesEnEstado(p, 'DEVOLUCIONES'), bajas: unidadesEnEstado(p, 'BAJAS_RECHAZADOS'),
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
            <div className="flex min-h-14 items-center justify-between px-4" data-testid="unidades-devoluciones">
              <dt className="flex items-center gap-2 text-sm text-gray-800"><Undo2 className="h-4 w-4 text-orange-700" aria-hidden />Devoluciones</dt>
              <dd className="tabular font-medium">{num(u.devoluciones)}</dd>
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
          {puede(ctx.roles, 'ejecutar') && <Link href="/entradas/nuevo" className="btn-secondary"><Inbox className="h-5 w-5" aria-hidden />Registrar una entrada</Link>}
          <Link href="/productos" className="btn-secondary"><Boxes className="h-5 w-5" aria-hidden />Productos</Link>
          {puedeCrearProducto(ctx.roles) && <Link href="/productos/nuevo" className="btn-secondary"><FilePlus2 className="h-5 w-5" aria-hidden />Dar de alta un producto</Link>}
        </div>
      </section>
    </div>
  )
}
