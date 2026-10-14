'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ChevronRight, Plus, Route, Settings2 } from 'lucide-react'
import { crearRutaAccion } from '@/app/acciones-rutas'
import type { PanoramaRutas } from '@/domain/rutas'
import { useAccion } from '../usar-accion'
import { Aviso } from '../entradas/aviso'
import { ChipEstadoRuta } from './chips-ruta'

const fecha = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('es-PE', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
const mañana = (hoy: string) => new Date(Date.parse(`${hoy}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10)

export function ListaRutas({ panorama, puedePlanificar }: { panorama: PanoramaRutas; puedePlanificar: boolean }) {
  const router = useRouter()
  const { pendiente, mensaje, ejecutar } = useAccion()
  const [dia, setDia] = useState(mañana(panorama.hoy))
  const { rutas } = panorama
  const porPlanificar = panorama.pedidos.filter((p) => !p.enRuta && !p.cambioPorRevisar && !p.sinCatalogo.length).length

  const crear = () => ejecutar(() => crearRutaAccion({ fecha: dia }), { refrescar: false, alExito: (r) => router.push(`/rutas/${r.id}`) })

  return (
    <div className="space-y-4" data-testid="lista-rutas">
      {puedePlanificar && (
        <section className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white p-4" aria-label="Nueva ruta">
          <div>
            <label htmlFor="nueva-fecha" className="etiqueta">Fecha de la ruta</label>
            <input id="nueva-fecha" type="date" className="campo" min={panorama.hoy} value={dia} onChange={(e) => setDia(e.target.value)} data-testid="nueva-ruta-fecha" />
          </div>
          <button type="button" className="btn-primary" onClick={crear} disabled={pendiente || !dia} data-testid="nueva-ruta"><Plus className="h-5 w-5" aria-hidden />{pendiente ? 'Creando…' : 'Nueva ruta'}</button>
          <Link href="/rutas/recursos" className="btn-secondary" data-testid="ir-recursos"><Settings2 className="h-5 w-5" aria-hidden />Personal y vehículos</Link>
          <p className="basis-full text-sm text-gray-700" data-testid="pedidos-por-planificar">{porPlanificar === 0 ? 'No hay pedidos esperando ruta.' : `${porPlanificar} ${porPlanificar === 1 ? 'pedido espera' : 'pedidos esperan'} ruta.`}</p>
        </section>
      )}
      {mensaje?.tipo === 'error' && <Aviso tipo="error">{mensaje.texto}</Aviso>}

      {rutas.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white px-6 py-14 text-center" data-testid="rutas-vacio">
          <Route className="mx-auto h-10 w-10 text-gray-400" aria-hidden />
          <p className="mt-3 font-medium text-gray-900">Todavía no hay rutas</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-gray-600">Crea la primera con la fecha de la salida y agrega los pedidos de la bandeja.</p>
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-lg border border-gray-200 bg-white md:block">
            <table className="w-full text-[13px] xl:text-sm" data-testid="tabla-rutas">
              <caption className="sr-only">Rutas de distribución</caption>
              <thead className="border-b border-gray-200 bg-gray-50 text-left text-gray-700"><tr>
                <th scope="col" className="px-3 py-2 font-medium">Ruta</th><th scope="col" className="px-3 py-2 font-medium">Fecha</th><th scope="col" className="px-3 py-2 font-medium">Vehículo</th>
                <th scope="col" className="px-3 py-2 font-medium">Conductor</th><th scope="col" className="px-3 py-2 text-right font-medium">Paradas</th><th scope="col" className="px-3 py-2 text-right font-medium">Unidades</th>
                <th scope="col" className="px-3 py-2 font-medium">Estado</th><th scope="col" className="px-3 py-2"><span className="sr-only">Abrir</span></th>
              </tr></thead>
              <tbody className="divide-y divide-gray-100">
                {rutas.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50" data-testid="fila-ruta">
                    <td className="px-3 py-3"><Link href={`/rutas/${r.id}`} className="tabular font-heading text-sm font-semibold tracking-wide text-green-800 underline">{r.numero}</Link>{r.version > 2 && <span className="ml-2 text-xs text-gray-600">v{r.version}</span>}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-gray-900">{fecha(r.fecha)}</td>
                    <td className="px-3 py-3 text-gray-800">{r.vehiculo?.placa ?? <span className="text-gray-500">Sin elegir</span>}</td>
                    <td className="px-3 py-3 text-gray-800">{r.conductor?.nombre ?? <span className="text-gray-500">Sin elegir</span>}</td>
                    <td className="tabular px-3 py-3 text-right text-gray-900">{r.paradas.length}</td>
                    <td className="tabular px-3 py-3 text-right text-gray-900">{r.unidades.toLocaleString('es-PE')} u</td>
                    <td className="px-3 py-3"><ChipEstadoRuta estado={r.estado} /></td>
                    <td className="px-3 py-3 text-right"><Link href={`/rutas/${r.id}`} className="btn-secondary btn-sm" aria-label={`Abrir ${r.numero}`}>Abrir</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 bg-white md:hidden" data-testid="lista-rutas-movil">
            {rutas.map((r) => (
              <li key={r.id}>
                <Link href={`/rutas/${r.id}`} className="flex min-h-16 items-center gap-3 px-4 py-3 active:bg-gray-50" data-testid="fila-ruta-movil">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center justify-between gap-2"><span className="tabular font-heading text-sm font-semibold tracking-wide text-gray-900">{r.numero}</span><ChipEstadoRuta estado={r.estado} /></div>
                    <p className="text-sm text-gray-700">{fecha(r.fecha)} · {r.vehiculo?.placa ?? 'sin vehículo'} · {r.paradas.length} {r.paradas.length === 1 ? 'parada' : 'paradas'}</p>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-gray-400" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
