import Link from 'next/link'
import { ArrowLeft, CheckCircle2, Eye, TriangleAlert } from 'lucide-react'
import { ETIQUETA_ESTADO_RUTA } from '@/domain/rutas'
import { faltantesDeParada, type RutaMia } from '@/domain/mis-rutas'

/** Así le aparece la ruta al transportista en «Mis rutas» (solo lectura): el Jefe de Transporte la revisa antes de que salga y corrige lo que falte. */
export function VistaTransportista({ ruta }: { ruta: RutaMia }) {
  const conFalta = ruta.paradas.filter((p) => faltantesDeParada(p).length > 0).length
  return (
    <div className="mx-auto max-w-xl space-y-4" data-testid="vista-transportista">
      <Link href={`/rutas/${ruta.id}`} className="inline-flex items-center gap-1.5 text-sm text-gray-700 underline"><ArrowLeft className="h-4 w-4" aria-hidden />Volver a la ruta</Link>
      <header>
        <h1 className="flex items-center gap-2 font-heading text-3xl font-semibold uppercase tracking-wide text-gray-900"><Eye className="h-7 w-7" aria-hidden />Así la ve el transportista</h1>
        <p className="mt-1 text-gray-700">Esto es lo que le aparece en «Mis rutas» al conductor y al auxiliar. Solo para revisar: aquí no se marca nada. Lo que falte se corrige en el pedido, la guía o la ruta.</p>
      </header>
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <p className="tabular font-heading text-xl font-medium tracking-wide text-gray-900">{ruta.numero}</p>
        <p className="text-sm text-gray-700">{[ruta.vehiculo && `Vehículo ${ruta.vehiculo}`, ruta.conductor && `Conductor ${ruta.conductor}`, ruta.auxiliar && `Auxiliar ${ruta.auxiliar}`].filter(Boolean).join(' · ') || 'Sin vehículo ni conductor todavía'}</p>
        <p className="mt-1 text-sm text-gray-600">{ETIQUETA_ESTADO_RUTA[ruta.estado]}</p>
        {ruta.paradas.length > 0 && (conFalta === 0
          ? <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-green-800" data-testid="vt-completa"><CheckCircle2 className="h-4 w-4" aria-hidden />Todas las paradas tienen sus datos.</p>
          : <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-amber-900" data-testid="vt-faltan"><TriangleAlert className="h-4 w-4" aria-hidden />{conFalta} {conFalta === 1 ? 'parada tiene' : 'paradas tienen'} datos por completar.</p>)}
      </div>
      {ruta.paradas.length === 0 ? <p className="text-sm text-gray-700">Esta ruta no tiene paradas.</p> : (
        <ul className="space-y-3">
          {ruta.paradas.map((p) => {
            const falta = faltantesDeParada(p)
            return (
              <li key={p.id} className="rounded-lg border border-gray-200 bg-white p-4" data-testid="vt-parada">
                <p className="tabular text-xs font-medium text-gray-600">Parada {p.secuencia}{p.pedidoNumero ? ` · ${p.pedidoNumero}` : ''}</p>
                <h2 className="font-medium text-gray-900">{p.cliente}</h2>
                <p className="text-sm text-gray-700">{[p.direccion, p.distrito].filter(Boolean).join(' · ') || 'Sin dirección'}</p>
                {p.ventanaCita && <p className="text-sm text-gray-600">Horario: {p.ventanaCita}</p>}
                <dl className="mt-1 grid grid-cols-[auto,1fr] gap-x-2 gap-y-0.5 text-sm text-gray-700">
                  <dt className="text-gray-600">Teléfono</dt><dd className="tabular">{p.telefono ?? '—'}</dd>
                  <dt className="text-gray-600">Condición</dt><dd>{p.condicion ?? '—'}</dd>
                  <dt className="text-gray-600">Guía</dt><dd className="tabular">{p.guia ?? '—'}</dd>
                  <dt className="text-gray-600">Representante</dt><dd>{p.representante ?? '—'}</dd>
                  <dt className="text-gray-600">Forma de pago</dt><dd>{p.formaPago ?? '—'}</dd>
                </dl>
                {falta.length > 0 && <p className="mt-2 flex items-start gap-1.5 text-sm text-amber-900" data-testid="vt-falta"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />Falta {falta.join(', ')}.</p>}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
