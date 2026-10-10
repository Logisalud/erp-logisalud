import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { exigirContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import { accionesDeOrden } from '@/domain/inventario'
import { ETIQUETA_ESTADO } from '@/domain/estados'
import { formatoFecha, formatoFechaHora } from '@/domain/fechas'
import { ChipOrden, ChipVerificacion } from '@/components/inventario/chips-inventario'
import { AccionesMovimiento } from '@/components/inventario/acciones-movimiento'

export const metadata = { title: 'Movimiento — WMS LOGISALUD' }

export default async function DetalleMovimiento({ params }: { params: { id: string } }) {
  const ctx = await exigirContexto()
  const o = await repositorio().obtenerMovimiento(decodeURIComponent(params.id))
  if (!o) notFound()
  const acciones = accionesDeOrden(o, ctx.usuario.id, ctx.roles)
  const unidades = o.lineas.reduce((n, l) => n + l.cantidad, 0)
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <Link href="/movimientos" className="inline-flex min-h-10 items-center gap-1.5 text-sm text-gray-700 hover:underline"><ArrowLeft className="h-4 w-4" aria-hidden />Movimientos</Link>
      <header>
        <div className="flex flex-wrap items-center gap-2"><ChipOrden estado={o.estado} /></div>
        <h1 className="tabular mt-2 font-heading text-3xl font-semibold uppercase tracking-wide text-gray-900" data-testid="titulo-movimiento">{o.numero}</h1>
        <p className="mt-1 text-gray-700">{o.motivo}</p>
      </header>

      <section aria-labelledby="quienes">
        <h2 id="quienes" className="sr-only">Quién hizo qué</h2>
        <dl className="grid gap-x-8 gap-y-2 rounded-lg border border-gray-200 bg-white px-4 py-3 sm:grid-cols-2" data-testid="personas-movimiento">
          <div className="flex items-baseline gap-3"><dt className="w-28 shrink-0 text-sm text-gray-600">Ejecutado por</dt><dd className="text-gray-900">{o.ejecutor} <span className="text-sm text-gray-600">· {formatoFechaHora(o.ejecutadoEn)}</span></dd></div>
          <div className="flex items-baseline gap-3"><dt className="w-28 shrink-0 text-sm text-gray-600">Verificado por</dt><dd className="text-gray-900">{o.verificador ? <>{o.verificador} <span className="text-sm text-gray-600">· {formatoFechaHora(o.verificadoEn)}</span></> : <span className="text-gray-600">pendiente: otra persona</span>}</dd></div>
        </dl>
        <p className="mt-2 text-xs text-gray-600">Quien ejecuta un movimiento no lo verifica. El stock cambia cuando se verifica cada línea; hasta entonces sus unidades están reservadas.</p>
      </section>

      <section aria-labelledby="lineas">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="lineas" className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">Qué se mueve</h2>
          <p className="tabular text-sm text-gray-700" data-testid="totales-movimiento">{o.lineas.length} {o.lineas.length === 1 ? 'línea' : 'líneas'} · {unidades.toLocaleString('es-PE')} u</p>
        </div>

        {/* PC y tablet: tabla */}
        <div className="mt-3 hidden overflow-x-auto rounded-lg border border-gray-200 bg-white md:block">
          <table className="w-full text-sm" data-testid="tabla-lineas">
            <caption className="sr-only">Líneas del movimiento {o.numero}</caption>
            <thead className="border-b border-gray-200 bg-gray-50 text-left text-gray-700">
              <tr>{['Producto', 'Lote', 'Vence', 'Propietario', 'Estado sanitario', 'Origen', 'Destino', 'Cantidad', 'Verificación'].map((c, i) => <th key={c} scope="col" className={`px-3 py-2.5 font-medium ${i === 7 ? 'text-right' : ''}`}>{c}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {o.lineas.map((l) => (
                <tr key={l.id} data-testid="fila-linea">
                  <td className="px-3 py-2.5 font-medium text-gray-900">{l.producto}</td>
                  <td className="tabular px-3 py-2.5 text-gray-800"><Link href={`/lotes/${l.loteId}`} className="underline underline-offset-2" data-testid="ir-lote">{l.lote}</Link></td>
                  <td className="tabular whitespace-nowrap px-3 py-2.5 text-gray-800">{formatoFecha(l.vence)}</td>
                  <td className="px-3 py-2.5 text-gray-800">{l.propietario}</td>
                  <td className="px-3 py-2.5 text-gray-800">{ETIQUETA_ESTADO[l.estado]}</td>
                  <td className="tabular px-3 py-2.5 font-medium text-gray-900">{l.desde}</td>
                  <td className="tabular px-3 py-2.5 font-medium text-gray-900">{l.hacia}</td>
                  <td className="tabular px-3 py-2.5 text-right font-medium text-gray-900">{l.cantidad}</td>
                  <td className="px-3 py-2.5"><span data-testid="estado-linea"><ChipVerificacion v={l.verificacion} /></span>{l.notaDiferencia && <p className="mt-1 max-w-48 text-xs text-gray-700">{l.notaDiferencia}</p>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Teléfono: una fila compacta por línea, sin desplazamiento horizontal */}
        <ul className="mt-3 divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white md:hidden" data-testid="lineas-movimiento">
          {o.lineas.map((l) => (
            <li key={l.id} className="space-y-1 px-4 py-3" data-testid="fila-linea-movil">
              <p className="font-medium text-gray-900">{l.producto}</p>
              <p className="tabular text-sm text-gray-700">Lote <Link href={`/lotes/${l.loteId}`} className="underline underline-offset-2" data-testid="ir-lote">{l.lote}</Link> · vence {formatoFecha(l.vence)} · {l.propietario} · {ETIQUETA_ESTADO[l.estado]}</p>
              <p className="tabular flex flex-wrap items-center gap-x-2 font-heading text-base font-semibold tracking-wide text-gray-900">{l.desde}<ArrowRight className="h-4 w-4 text-gray-500" aria-hidden />{l.hacia}<span className="ml-auto font-body text-sm font-medium">{l.cantidad} u</span></p>
              <div className="flex flex-wrap items-center gap-2"><span data-testid="estado-linea-movil"><ChipVerificacion v={l.verificacion} /></span>{l.notaDiferencia && <span className="text-xs text-gray-700">{l.notaDiferencia}</span>}</div>
            </li>
          ))}
        </ul>
      </section>

      <section className="card" aria-label="Siguiente paso">
        <AccionesMovimiento orden={o} acciones={acciones} />
      </section>
    </div>
  )
}
