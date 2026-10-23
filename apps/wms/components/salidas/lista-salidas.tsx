'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { ChevronRight, PackageSearch, Search } from 'lucide-react'
import { ETIQUETA_ETAPA, filtrarSalidas, type EtapaSalida, type SalidaResumen } from '@/domain/despacho'
import { ChipEtapa } from './chip-etapa'
import { avanceDeSalida } from '@/domain/pasos'
import { EtiquetasOrigen } from './etiquetas-origen'

const ETAPAS = Object.keys(ETIQUETA_ETAPA) as EtapaSalida[]
const extrasDe = (s: SalidaResumen) => ({ vendedor: s.vendedor, sinPedido: s.sinPedido, devolucion: s.devolucion, devolucionHref: s.devolucionHref, tipo: s.tipo, destruccion: s.motivo === 'DESTRUCCION', sinRuta: s.tipo === 'CLIENTE' ? undefined : !s.rutaNumero, porRuta: s.origen === 'MANUAL' && s.tipo !== 'CLIENTE' })

export function ListaSalidas({ salidas, verCambios }: { salidas: SalidaResumen[]; verCambios: boolean }) {
  const [q, setQ] = useState('')
  const [etapa, setEtapa] = useState<'' | EtapaSalida>('')
  const vistas = useMemo(() => filtrarSalidas(salidas, { q, etapa }), [salidas, q, etapa])
  return (
    <div className="space-y-4" data-testid="lista-salidas">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white p-4">
        <div className="min-w-0 flex-1 basis-64">
          <label htmlFor="q-salidas" className="etiqueta">Buscar</label>
          <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500" aria-hidden />
            <input id="q-salidas" type="search" className="campo pl-10" placeholder="Salida, pedido, cliente o ruta" value={q} onChange={(e) => setQ(e.target.value)} data-testid="buscar-salidas" /></div>
        </div>
        <div>
          <label htmlFor="etapa-salidas" className="etiqueta">Etapa</label>
          <select id="etapa-salidas" className="campo" value={etapa} onChange={(e) => setEtapa(e.target.value as '' | EtapaSalida)} data-testid="filtro-etapa">
            <option value="">Todas</option>
            {ETAPAS.map((x) => <option key={x} value={x}>{ETIQUETA_ETAPA[x]}</option>)}
          </select>
        </div>
        {verCambios && <Link href="/salidas/cambios-fefo" className="btn-secondary" data-testid="ir-cambios-fefo">Cambios fuera de FEFO</Link>}
      </div>

      {vistas.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white px-6 py-14 text-center" data-testid="salidas-vacio">
          <PackageSearch className="mx-auto h-10 w-10 text-gray-400" aria-hidden />
          <p className="mt-3 font-medium text-gray-900">{salidas.length === 0 ? 'Todavía no hay salidas' : 'Ninguna salida coincide'}</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-gray-600">{salidas.length === 0 ? 'Las salidas nacen cuando un pedido entra a una ruta: el WMS le asigna el stock por vencimiento.' : 'Cambia la búsqueda o la etapa.'}</p>
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-lg border border-gray-200 bg-white md:block">
            <table className="w-full text-[13px] xl:text-sm" data-testid="tabla-salidas">
              <caption className="sr-only">Salidas por pedido</caption>
              <thead className="border-b border-gray-200 bg-gray-50 text-left text-gray-700"><tr>
                <th scope="col" className="px-3 py-2 font-medium">Salida</th><th scope="col" className="px-3 py-2 font-medium">Pedido</th><th scope="col" className="px-3 py-2 font-medium">Cliente</th>
                <th scope="col" className="px-3 py-2 font-medium">Ruta</th><th scope="col" className="px-3 py-2 font-medium">Guía</th><th scope="col" className="px-3 py-2 text-right font-medium">Líneas</th><th scope="col" className="px-3 py-2 text-right font-medium">Unidades</th>
                <th scope="col" className="px-3 py-2 font-medium">Etapa</th><th scope="col" className="px-3 py-2 font-medium">Qué sigue y quién lo hace</th><th scope="col" className="px-3 py-2"><span className="sr-only">Abrir</span></th>
              </tr></thead>
              <tbody className="divide-y divide-gray-100">
                {vistas.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50" data-testid="fila-salida">
                    <td className="px-3 py-3"><Link href={`/salidas/${s.id}`} className="tabular font-heading text-sm font-semibold tracking-wide text-green-800 underline">{s.numero}</Link><span className="mt-1 block"><EtiquetasOrigen datos={s} conTipo /></span></td>
                    <td className="tabular px-3 py-3 text-gray-900">{s.pedidoNumero ?? '—'}</td>
                    <td className="px-3 py-3 text-gray-800">{s.cliente ?? '—'}</td>
                    <td className="tabular px-3 py-3 text-gray-800">{s.rutaNumero ?? <span className="text-gray-500">Sin ruta</span>}</td>
                    <td className="tabular px-3 py-3 text-gray-800">{s.guia ?? <span className="text-gray-500">—</span>}{!!s.documentosFaltantes && <span className="ml-2 text-xs text-amber-900">{s.documentosFaltantes} {s.documentosFaltantes === 1 ? 'documento falta' : 'documentos faltan'}</span>}</td>
                    <td className="tabular px-3 py-3 text-right">{s.lineas}</td>
                    <td className="tabular px-3 py-3 text-right">{s.unidades.toLocaleString('es-PE')} u</td>
                    <td className="px-3 py-3"><ChipEtapa etapa={s.etapa} /></td>
                    <td className="max-w-[18rem] px-3 py-3 text-xs text-gray-800" data-testid="siguiente-salida">{(() => { const x = avanceDeSalida(s.etapa, s.id, extrasDe(s)).siguiente; return <><span className="block text-gray-900 first-letter:uppercase">{x.texto}</span><span className="block text-gray-600">{x.fin ? '' : `Lo hace: ${x.responsable.etiqueta}`}</span></> })()}</td>
                    <td className="px-3 py-3 text-right"><Link href={`/salidas/${s.id}`} className="btn-secondary btn-sm" aria-label={`Abrir ${s.numero}`}>Abrir</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 bg-white md:hidden" data-testid="lista-salidas-movil">
            {vistas.map((s) => (
              <li key={s.id}>
                <Link href={`/salidas/${s.id}`} className="flex min-h-16 items-center gap-3 px-4 py-3 active:bg-gray-50" data-testid="fila-salida-movil">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center justify-between gap-2"><span className="tabular font-heading text-sm font-semibold tracking-wide text-gray-900">{s.pedidoNumero ?? s.numero}</span><ChipEtapa etapa={s.etapa} /></div>
                    <p className="truncate text-sm text-gray-700">{s.cliente ?? 'Sin cliente'} · {s.unidades.toLocaleString('es-PE')} u</p>
                    <EtiquetasOrigen datos={s} conTipo />
                    <p className="text-xs text-gray-600">Sigue: {avanceDeSalida(s.etapa, s.id, extrasDe(s)).siguiente.texto}</p>
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
