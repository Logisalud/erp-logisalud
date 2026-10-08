import Link from 'next/link'
import { ArrowRight, CheckCircle2, ClipboardList, ShieldAlert } from 'lucide-react'
import { exigirContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import { formatoFecha } from '@/domain/fechas'
import { ChipEstado, ChipValidacion } from '@/components/chips'
import { Aviso } from '@/components/entradas/aviso'
import { ChipActa, ChipAlerta } from '@/components/entradas/chips-entradas'
import type { OrganolepticaVista } from '@/domain/entradas-vistas'
import type { EstadoValidacion } from '@/domain/tipos'

export const metadata = { title: 'Calidad — WMS LOGISALUD' }

function Fila({ o, hoy }: { o: OrganolepticaVista; hoy: string }) {
  const vencido = !!o.rsVence && o.rsVence < hoy && !o.decision
  return (
    <li>
      <Link href={`/calidad/${o.id}`} className="flex min-h-16 flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-4 py-3 transition duration-fast hover:bg-gray-50" data-testid="fila-organoleptica">
        <span className="min-w-0">
          <span className="block truncate font-medium text-gray-900">{o.producto}</span>
          <span className="block text-sm text-gray-600">Lote {o.lote} · vence {formatoFecha(o.vence)} · {o.cantidadLote.toLocaleString('es-PE')} und. · {o.propietario}</span>
          <span className="block text-xs text-gray-500">{o.numero}{o.referencia ? ` · ${o.referencia}` : ''}</span>
        </span>
        <span className="flex flex-wrap items-center gap-2">
          {vencido && <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-800"><ShieldAlert className="h-3.5 w-3.5" aria-hidden />Registro vencido</span>}
          {o.decision ? <ChipEstado estado={o.decision} /> : <ChipActa estado={o.estado === 'PENDIENTE_DT' ? 'PENDIENTE_DT' : 'BORRADOR'} />}
          <ArrowRight className="h-4 w-4 text-gray-400" aria-hidden />
        </span>
      </Link>
    </li>
  )
}

export default async function Calidad() {
  const ctx = await exigirContexto()
  const repo = repositorio()
  const [cola, panorama] = await Promise.all([repo.colaDireccionTecnica(), repo.panorama()])
  const esDT = ctx.roles.includes('direccion_tecnica')
  const esSandra = ctx.roles.includes('asistente_dt')

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-heading text-3xl font-semibold uppercase tracking-wide text-gray-900">Calidad</h1>
        <p className="mt-1 text-gray-700">{esDT ? 'Lo que espera tu decisión.' : 'Pendientes de Dirección Técnica: lo que se llena, lo que se decide y lo que ya se decidió.'}</p>
      </header>

      <section aria-labelledby="pendientes" data-testid="cola-dt">
        <h2 id="pendientes" className="flex items-center gap-2 font-heading text-lg font-medium uppercase tracking-wide text-gray-800"><ClipboardList className="h-5 w-5" aria-hidden />Pendientes de Dirección Técnica<span className="tabular rounded-full bg-gray-100 px-2 py-0.5 text-sm text-gray-700">{cola.organolepticas.length}</span></h2>
        <p className="mb-3 text-sm text-gray-600">Actas organolépticas ya llenas. Katia decide Aprobado o Bajas/Rechazados y firma.</p>
        {cola.organolepticas.length === 0
          ? <div className="card flex items-center gap-3 text-sm text-gray-700"><CheckCircle2 className="h-5 w-5 text-green-700" aria-hidden />Nada espera a Dirección Técnica por ahora.</div>
          : <ul className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 bg-white">{cola.organolepticas.map((o) => <Fila key={o.id} o={o} hoy={panorama.hoy} />)}</ul>}
      </section>

      {cola.alertas.length > 0 && (
        <section aria-labelledby="alertas-dt">
          <h2 id="alertas-dt" className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">Alertas para Dirección Técnica</h2>
          <ul className="mt-3 space-y-2">{cola.alertas.map((a) => <li key={a.id}><Aviso tipo="atencion"><span className="mb-1 flex"><ChipAlerta tipo={a.tipo} /></span>{a.mensaje}</Aviso></li>)}</ul>
          <Link href="/alertas" className="mt-2 inline-flex min-h-10 items-center gap-1.5 text-sm text-gray-800 underline">Atender las alertas <ArrowRight className="h-4 w-4" aria-hidden /></Link>
        </section>
      )}

      <section aria-labelledby="por-llenar">
        <h2 id="por-llenar" className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">Por llenar <span className="tabular rounded-full bg-gray-100 px-2 py-0.5 text-sm text-gray-700">{cola.borradores.length}</span></h2>
        <p className="mb-3 text-sm text-gray-600">{esSandra ? 'Estas las llenas tú. Cuando termines, se envían a Dirección Técnica.' : 'Las llena Sandra (Asistente de Dirección Técnica).'}</p>
        {cola.borradores.length === 0
          ? <div className="card text-sm text-gray-700">No hay actas por llenar.</div>
          : <ul className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 bg-white">{cola.borradores.map((o) => <Fila key={o.id} o={o} hoy={panorama.hoy} />)}</ul>}
      </section>

      {cola.productosPorValidar.length > 0 && esDT && (
        <section aria-labelledby="validar">
          <h2 id="validar" className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">Productos por validar</h2>
          <ul className="mt-3 divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 bg-white">
            {cola.productosPorValidar.map((p) => (
              <li key={p.id}><Link href={`/productos/${p.id}`} className="flex min-h-14 items-center justify-between gap-3 px-4 py-2.5 hover:bg-gray-50"><span className="min-w-0 truncate"><span className="font-medium text-gray-900">{p.descripcion}</span> <span className="text-sm text-gray-600">{p.codigo}</span></span><ChipValidacion estado={p.estado as EstadoValidacion} /></Link></li>
            ))}
          </ul>
        </section>
      )}

      {cola.decididas.length > 0 && (
        <section aria-labelledby="decididas">
          <h2 id="decididas" className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">Decididas hace poco</h2>
          <ul className="mt-3 divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 bg-white">{cola.decididas.map((o) => <Fila key={o.id} o={o} hoy={panorama.hoy} />)}</ul>
        </section>
      )}
    </div>
  )
}
