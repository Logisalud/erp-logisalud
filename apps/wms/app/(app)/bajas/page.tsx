import Link from 'next/link'
import { ArrowRight, CheckCircle2, FilePlus2, FileText, Lock, PackageX } from 'lucide-react'
import { exigirContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import { formatoFecha, formatoFechaHora } from '@/domain/fechas'
import { ETIQUETA_MOTIVO_BAJA, puedeSolicitarBaja, siguientePasoBaja, type OrdenBajaResumen } from '@/domain/bajas'
import { ChipEstadoBaja, ChipMotivoBaja } from '@/components/bajas/chips-baja'
import { Aviso } from '@/components/entradas/aviso'

export const metadata = { title: 'Bajas — WMS LOGISALUD' }

type Vista = 'por-autorizar' | 'por-trasladar' | 'emitidas' | 'cerradas' | 'todas'
const VISTAS: { id: Vista; texto: string; filtro: (o: OrdenBajaResumen) => boolean; vacio: string }[] = [
  { id: 'por-autorizar', texto: 'Por autorizar', filtro: (o) => o.estado === 'SOLICITADA', vacio: 'No hay bajas esperando autorización. Cuando alguien pida una, aparece aquí.' },
  { id: 'por-trasladar', texto: 'Por trasladar', filtro: (o) => o.porTrasladar, vacio: 'No hay bajas autorizadas esperando traslado al área de Bajas.' },
  { id: 'emitidas', texto: 'Emitidas', filtro: (o) => o.estado === 'EMITIDA', vacio: 'Todavía no se emitió ninguna Orden de Baja.' },
  { id: 'cerradas', texto: 'Cerradas', filtro: (o) => o.estado === 'RECHAZADA' || o.estado === 'CANCELADA' || o.estado === 'ANULADA', vacio: 'No hay solicitudes rechazadas, retiradas ni Órdenes anuladas.' },
  { id: 'todas', texto: 'Todas', filtro: () => true, vacio: 'Todavía no hay bajas. Pide la primera con «Nueva baja».' },
]

export default async function Bajas({ searchParams }: { searchParams: { ver?: string } }) {
  const ctx = await exigirContexto()
  const repo = repositorio()
  const [todas, enBajas] = await Promise.all([repo.listarBajas(), repo.stockEnBajas()])
  const vista = VISTAS.find((v) => v.id === searchParams.ver) ?? VISTAS[0]
  const visibles = todas.filter(vista.filtro)
  const puedePedir = puedeSolicitarBaja(ctx.roles)
  const esDT = ctx.roles.includes('direccion_tecnica')
  const porAutorizar = todas.filter((o) => o.estado === 'SOLICITADA').length

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-semibold uppercase tracking-wide text-gray-900">Bajas</h1>
          <p className="mt-1 max-w-3xl text-gray-700">
            Dar de baja es un proceso con documento: se pide, Dirección Técnica lo autoriza con su sustento y el WMS emite la Orden de Baja LS-FR.56.01. Lo vencido solo sale por aquí.
          </p>
        </div>
        {puedePedir
          ? <Link href="/bajas/nueva" className="btn-primary" data-testid="nueva-baja"><FilePlus2 className="h-5 w-5" aria-hidden />Nueva baja</Link>
          : <p className="flex items-center gap-2 text-sm text-gray-600"><Lock className="h-4 w-4" aria-hidden />Pedir una baja es de Dirección Técnica, su asistente y el Jefe de Almacén.</p>}
      </header>

      {esDT && porAutorizar > 0 && vista.id !== 'por-autorizar' && (
        <Aviso tipo="atencion" testid="aviso-por-autorizar"><strong>{porAutorizar === 1 ? '1 baja espera' : `${porAutorizar} bajas esperan`} tu autorización.</strong>{' '}<Link href="/bajas?ver=por-autorizar" className="underline">Revisarlas</Link></Aviso>
      )}

      <section aria-labelledby="ordenes">
        <h2 id="ordenes" className="sr-only">Órdenes de Baja</h2>
        <nav aria-label="Filtrar las bajas" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
          {VISTAS.map((v) => {
            const n = todas.filter(v.filtro).length
            const on = v.id === vista.id
            return (
              <Link key={v.id} href={`/bajas?ver=${v.id}`} aria-current={on ? 'page' : undefined} data-testid={`filtro-${v.id}`}
                className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium transition duration-fast ${on ? 'border-green-300 bg-green-50 text-green-900' : 'border-gray-300 bg-white text-gray-800 hover:border-gray-400'}`}>
                {v.texto}<span className="tabular rounded-full bg-white/70 px-1.5 text-xs text-gray-700">{n}</span>
              </Link>
            )
          })}
        </nav>

        {visibles.length === 0 ? (
          <div className="mt-3 rounded-lg border border-gray-200 bg-white px-6 py-12 text-center" data-testid="bajas-vacio">
            <PackageX className="mx-auto h-10 w-10 text-gray-400" aria-hidden />
            <p className="mt-3 font-medium text-gray-900">{vista.id === 'todas' ? 'Todavía no hay bajas' : `Nada en «${vista.texto}»`}</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-gray-600">{vista.vacio}</p>
            {puedePedir && vista.id === 'todas' && <Link href="/bajas/nueva" className="btn-secondary mt-4 inline-flex">Pedir la primera baja</Link>}
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 bg-white" data-testid="lista-bajas">
            {visibles.map((o) => {
              const paso = siguientePasoBaja(o)
              return (
                <li key={o.id}>
                  <Link href={`/bajas/${o.id}`} className="flex min-h-16 flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 transition duration-fast hover:bg-gray-50" data-testid="fila-baja">
                    <span className="min-w-0">
                      <span className="tabular block font-heading text-base font-semibold tracking-wide text-gray-900">{o.numero}</span>
                      <span className="block truncate text-sm text-gray-700">{o.productos.slice(0, 2).join(', ')}{o.productos.length > 2 ? ` y ${o.productos.length - 2} más` : ''}</span>
                      <span className="block text-xs text-gray-600">{o.propietario} · {o.unidades.toLocaleString('es-PE')} und. en {o.lineas} {o.lineas === 1 ? 'línea' : 'líneas'} · pidió {o.solicitadaPor} el {formatoFechaHora(o.solicitadaEn)}</span>
                      <span className="mt-1 flex flex-wrap gap-1.5">{o.motivos.map((m) => <ChipMotivoBaja key={m} motivo={m} />)}</span>
                    </span>
                    <span className="flex flex-col items-end gap-1.5 text-right">
                      <ChipEstadoBaja estado={o.estado} porTrasladar={o.porTrasladar} />
                      {paso.tono !== 'cerrada' && <span className="max-w-64 text-xs text-gray-700">Siguiente: {paso.texto}</span>}
                      <ArrowRight className="h-4 w-4 text-gray-400" aria-hidden />
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="en-bajas" data-testid="stock-en-bajas">
        <h2 id="en-bajas" className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">En Bajas ahora <span className="tabular rounded-full bg-gray-100 px-2 py-0.5 text-sm text-gray-700">{enBajas.length}</span></h2>
        <p className="mb-3 max-w-3xl text-sm text-gray-600">
          El stock en estado Bajas/Rechazados, por propietario y lote. Lo de un cliente de almacenamiento sale a destrucción cuando el cliente lo indica, y solo desde el área de Bajas; nunca se devuelve ni se vende.
        </p>
        {enBajas.length === 0 ? (
          <div className="card flex items-center gap-3 text-sm text-gray-700"><CheckCircle2 className="h-5 w-5 text-green-700" aria-hidden />No hay stock en Bajas por ahora.</div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="w-full min-w-[44rem] text-left text-sm">
              <caption className="sr-only">Stock en Bajas por propietario y lote</caption>
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-600"><tr>
                <th scope="col" className="px-4 py-2 font-medium">Propietario</th><th scope="col" className="px-4 py-2 font-medium">Producto y lote</th><th scope="col" className="px-4 py-2 font-medium">Vence</th>
                <th scope="col" className="px-4 py-2 font-medium">Ubicación</th><th scope="col" className="px-4 py-2 text-right font-medium">Unidades</th><th scope="col" className="px-4 py-2 font-medium">Motivo y Orden</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-100">
                {enBajas.map((f) => (
                  <tr key={`${f.posicionId}|${f.loteId}`} data-testid="fila-en-bajas">
                    <td className="px-4 py-2.5 text-gray-900">{f.propietarioCodigo}</td>
                    <td className="px-4 py-2.5"><span className="block text-gray-900">{f.producto}</span><span className="text-xs text-gray-600">Lote {f.lote}</span></td>
                    <td className="px-4 py-2.5 text-gray-800">{f.vence ? formatoFecha(f.vence) : '—'}{f.vencido && <span className="ml-1.5 text-xs font-medium text-red-800">· vencido</span>}</td>
                    <td className="px-4 py-2.5 text-gray-800">{f.posicion}{!f.enAreaBajas && <span className="block text-xs text-amber-900">Por trasladar al área de Bajas</span>}</td>
                    <td className="tabular px-4 py-2.5 text-right font-medium text-gray-900">{f.cantidad.toLocaleString('es-PE')}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-700">{f.motivos.length ? f.motivos.map((m) => ETIQUETA_MOTIVO_BAJA[m]).join(', ') : 'Rechazado en la recepción'}{f.ordenesBaja.length > 0 && <span className="block"><FileText className="mr-1 inline h-3 w-3" aria-hidden />{f.ordenesBaja.join(', ')}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
