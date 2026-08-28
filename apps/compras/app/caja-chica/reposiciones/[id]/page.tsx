import { notFound } from 'next/navigation'
import { Encabezado } from '@/components/nav'
import { Money } from '@/components/money'
import { obtenerReposicion } from '@/services/caja-chica'
import { ETIQUETA_ESTADO_REPOSICION } from '@/domain/caja-chica'
import { AccionesReposicion } from './acciones'
import { VerComprobante } from './ver-comprobante'

export const dynamic = 'force-dynamic'

export default async function DetalleReposicion({ params }: { params: { id: string } }) {
  const reposicion = await obtenerReposicion(params.id)
  if (!reposicion) notFound()

  const moneda = reposicion.fondo?.moneda ?? 'PEN'

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Encabezado titulo={reposicion.codigo} atras={{ href: '/caja-chica/reposiciones', texto: 'Reposiciones' }} />

      <section className="card">
        <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-2">
          <div className="flex gap-2"><dt className="text-gray-500">Fondo:</dt><dd>{reposicion.fondo?.descripcion ?? '—'}</dd></div>
          <div className="flex gap-2"><dt className="text-gray-500">Estado:</dt><dd>{ETIQUETA_ESTADO_REPOSICION[reposicion.estado]}</dd></div>
        </dl>
        <p className="mt-1"><Money valor={reposicion.monto_solicitado} moneda={moneda} /></p>

        <AccionesReposicion reposicionId={reposicion.id} estado={reposicion.estado} />
      </section>

      <section className="card mt-4">
        <h2 className="font-heading text-lg">Movimientos incluidos</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {reposicion.movimientos.map((m) => (
            <li key={m.id} className="flex items-center justify-between border-b border-gray-100 py-1.5 last:border-0">
              <span>
                {m.categoria?.nombre ?? '—'} · {m.fecha} · {m.tipo_comprobante}{m.numero ? ` ${m.numero}` : ''}
                {!m.sustentable ? <span className="ml-2 text-xs text-amber-700">no sustentable</span> : null}
                {m.storage_path ? <VerComprobante storagePath={m.storage_path} /> : null}
              </span>
              <Money valor={m.monto} moneda={moneda} />
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
