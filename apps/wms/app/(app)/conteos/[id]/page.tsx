import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, EyeOff } from 'lucide-react'
import { exigirContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import { puedeDecidirAjuste, puedeProgramarConteo } from '@/domain/inventario'
import { formatoFechaHora } from '@/domain/fechas'
import { ChipConteo } from '@/components/inventario/chips-inventario'
import { LineasConteo } from '@/components/inventario/lineas-conteo'
import { CierreConteo } from '@/components/inventario/cierre-conteo'
import { AjustesPorDecidir } from '@/components/inventario/ajustes-por-decidir'
import { Aviso } from '@/components/entradas/aviso'

export const metadata = { title: 'Conteo — WMS LOGISALUD' }

export default async function DetalleConteo({ params }: { params: { id: string } }) {
  const ctx = await exigirContexto()
  const actor = { id: ctx.usuario.id, nombre: ctx.usuario.nombre, roles: ctx.roles }
  const d = await repositorio().obtenerConteo(decodeURIComponent(params.id), actor)
  if (!d) notFound()
  const gestiona = ctx.roles.some((r) => ['jefe_almacen', 'reemplazo_jefe', 'direccion_tecnica', 'admin_wms', 'auditoria_lectura'].includes(r))
  const pendientes = d.lineas.filter((l) => !l.resultado || l.resultado === 'DIFERENCIA_CONFIRMADA' || l.resultado === 'NO_CONCLUYENTE').length
  const cerrado = d.conteo.estado === 'CERRADO'
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <Link href="/conteos" className="inline-flex min-h-10 items-center gap-1.5 text-sm text-gray-700 hover:underline"><ArrowLeft className="h-4 w-4" aria-hidden />Conteos</Link>
      <header>
        <div className="flex flex-wrap items-center gap-2"><ChipConteo estado={d.conteo.estado} /></div>
        <h1 className="tabular mt-2 font-heading text-3xl font-semibold uppercase tracking-wide text-gray-900" data-testid="titulo-conteo">{d.conteo.numero}</h1>
        <p className="mt-1 text-gray-700">{d.conteo.nota ?? 'Conteo cíclico'} · programado por {d.conteo.programadoPor} el {formatoFechaHora(d.conteo.programadoEn)}</p>
      </header>

      {!gestiona && !cerrado && <Aviso tipo="info" testid="conteo-ciego"><span className="flex items-center gap-1.5 font-medium"><EyeOff className="h-4 w-4" aria-hidden />Conteo a ciegas</span>Cuenta las unidades reales de cada línea. El sistema no te muestra su cantidad hasta que el Jefe compare. No asumas que una caja está completa.</Aviso>}
      {!cerrado && <Aviso tipo="atencion" testid="conteo-ubicaciones-pausadas">Mientras este conteo esté abierto, sus ubicaciones no se mueven.</Aviso>}
      {cerrado && <Aviso tipo="ok" testid="conteo-cerrado">Conteo cerrado: {d.conteo.resultado === 'COINCIDE' ? 'físico y sistema coinciden' : d.conteo.resultado === 'CORREGIDO' ? 'se corrigió con un ajuste autorizado' : 'quedó escalado con su evidencia'}.{d.conteo.causa ? ` Causa: ${d.conteo.causa}.` : ''}{d.conteo.accion ? ` Acción: ${d.conteo.accion}.` : ''}</Aviso>}

      {d.ajustes.length > 0 && (
        <section aria-labelledby="ajs"><h2 id="ajs" className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">Ajustes de este conteo</h2><div className="mt-3"><AjustesPorDecidir ajustes={d.ajustes} puedeDecidir={puedeDecidirAjuste(ctx.roles)} /></div></section>
      )}

      <section aria-labelledby="lineas-c">
        <h2 id="lineas-c" className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">Líneas <span className="tabular rounded-full bg-gray-100 px-2 py-0.5 text-sm text-gray-700">{d.conteo.resueltas} de {d.conteo.lineas} resueltas</span></h2>
        <div className="mt-3"><LineasConteo lineas={d.lineas} gestiona={gestiona && puedeProgramarConteo(ctx.roles)} cerrado={cerrado} /></div>
      </section>

      {!cerrado && puedeProgramarConteo(ctx.roles) && <CierreConteo id={d.conteo.id} pendientes={pendientes} />}
    </div>
  )
}
