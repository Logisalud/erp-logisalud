import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { exigirContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import { accionesDeOrden } from '@/domain/inventario'
import { ETIQUETA_ESTADO } from '@/domain/estados'
import { formatoFecha, formatoFechaHora } from '@/domain/fechas'
import { ChipOrden } from '@/components/inventario/chips-inventario'
import { AccionesMovimiento } from '@/components/inventario/acciones-movimiento'

export const metadata = { title: 'Movimiento — WMS LOGISALUD' }

export default async function DetalleMovimiento({ params }: { params: { id: string } }) {
  const ctx = await exigirContexto()
  const o = await repositorio().obtenerMovimiento(decodeURIComponent(params.id))
  if (!o) notFound()
  const acciones = accionesDeOrden(o, ctx.usuario.id, ctx.roles)
  const pasos = [
    ['Preparó', o.preparador, o.preparadoEn], ['Autorizó', o.autorizadoPor, o.autorizadoEn], ['Movió', o.ejecutor, o.ejecutadoEn], ['Verificó', o.verificador, o.verificadoEn],
  ] as const
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Link href="/movimientos" className="inline-flex min-h-10 items-center gap-1.5 text-sm text-gray-700 hover:underline"><ArrowLeft className="h-4 w-4" aria-hidden />Movimientos</Link>
      <header>
        <div className="flex flex-wrap items-center gap-2"><ChipOrden estado={o.estado} /></div>
        <h1 className="tabular mt-2 font-heading text-3xl font-semibold uppercase tracking-wide text-gray-900" data-testid="titulo-movimiento">{o.numero}</h1>
        <p className="mt-1 text-gray-700">{o.motivo}</p>
      </header>

      <section className="card" aria-labelledby="lineas">
        <h2 id="lineas" className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">Qué se mueve</h2>
        <ul className="mt-2 divide-y divide-gray-100" data-testid="lineas-movimiento">
          {o.lineas.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
              <span className="min-w-0 flex-1"><span className="block font-medium text-gray-900">{l.producto}</span><span className="tabular text-sm text-gray-600">Lote {l.lote} · vence {formatoFecha(l.vence)} · {l.propietario} · {ETIQUETA_ESTADO[l.estado]}</span></span>
              <span className="tabular flex items-center gap-2 font-heading text-lg font-semibold tracking-wide">{l.desde}<ArrowRight className="h-4 w-4 text-gray-500" aria-hidden />{l.hacia}</span>
              <span className="tabular font-medium">{l.cantidad} u</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card" aria-labelledby="quienes">
        <h2 id="quienes" className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">Quién hizo qué</h2>
        <dl className="mt-2 grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {pasos.map(([k, quien, cuando]) => (
            <div key={k} className="flex items-baseline gap-2"><dt className="w-20 shrink-0 text-sm text-gray-600">{k}</dt><dd className="text-gray-900">{quien ? `${quien} · ${formatoFechaHora(cuando)}` : <span className="text-gray-500">pendiente</span>}</dd></div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-gray-600">Quien verifica es una persona distinta de quien preparó y de quien movió.</p>
      </section>

      <section className="card" aria-label="Siguiente paso">
        <AccionesMovimiento orden={o} acciones={acciones} />
      </section>
    </div>
  )
}
