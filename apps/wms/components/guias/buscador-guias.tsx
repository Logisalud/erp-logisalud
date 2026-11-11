'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { CheckCircle2, ExternalLink, FileSearch, Hourglass, Search, TriangleAlert, XCircle } from 'lucide-react'
import {
  ESTADOS_GUIA_BUSQUEDA, ETIQUETA_ESTADO_GUIA, FILTRO_GUIAS_VACIO, estadoDeGuia, filtrarGuias, ordenarGuias,
  type ColumnaOrdenGuias, type EstadoGuiaBusqueda, type FiltroGuias, type GuiaFila, type OrdenGuias, type RolDestinatario,
} from '@/domain/guias-busqueda'
import { ETIQUETA_ORIGEN, NOMBRE_MODO } from '@/domain/guia-electronica'
import { CHIP_AVISO, CHIP_NEUTRO, CHIP_OK } from '../estilos-opcion'

const base = 'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium leading-none whitespace-nowrap'
const ROJO = 'border-red-200 bg-red-50 text-red-800'

/** El estado de la guía, siempre con texto + ícono. */
function ChipEstadoGuia({ estado }: { estado: EstadoGuiaBusqueda }) {
  const m = ({
    ACEPTADA: { cls: CHIP_OK, Icono: CheckCircle2 }, ENVIADA: { cls: CHIP_AVISO, Icono: Hourglass }, RECHAZADA: { cls: ROJO, Icono: XCircle },
    ANULADA: { cls: ROJO, Icono: XCircle }, REGISTRADA: { cls: CHIP_NEUTRO, Icono: TriangleAlert },
  } satisfies Record<EstadoGuiaBusqueda, { cls: string; Icono: typeof XCircle }>)[estado]
  return <span className={`${base} ${m.cls}`} data-testid="chip-estado-guia" data-estado={estado}><m.Icono className="h-3.5 w-3.5" aria-hidden />{ETIQUETA_ESTADO_GUIA[estado]}</span>
}

const fecha = (iso?: string) => (iso ? iso.split('-').reverse().join('/') : '—')
const ROL: Record<RolDestinatario, string> = { CLIENTE: 'Cliente', PROVEEDOR: 'Proveedor' }
const COLUMNAS: { id: ColumnaOrdenGuias; titulo: string }[] = [{ id: 'numero', titulo: 'Guía' }, { id: 'fecha', titulo: 'Fecha' }, { id: 'destinatario', titulo: 'Destinatario' }, { id: 'estado', titulo: 'Estado' }]

export function BuscadorGuias({ guias }: { guias: GuiaFila[] }) {
  const [f, setF] = useState<FiltroGuias>(FILTRO_GUIAS_VACIO)
  const [orden, setOrden] = useState<OrdenGuias>({ columna: 'fecha', sentido: 'desc' })
  const vistas = useMemo(() => ordenarGuias(filtrarGuias(guias, f), orden), [guias, f, orden])
  const hayFiltro = JSON.stringify(f) !== JSON.stringify(FILTRO_GUIAS_VACIO)
  const set = <K extends keyof FiltroGuias>(k: K, v: FiltroGuias[K]) => setF((x) => ({ ...x, [k]: v }))
  const ordenarPor = (c: ColumnaOrdenGuias) => setOrden((o) => (o.columna === c ? { columna: c, sentido: o.sentido === 'asc' ? 'desc' : 'asc' } : { columna: c, sentido: c === 'fecha' ? 'desc' : 'asc' }))
  const flecha = (c: ColumnaOrdenGuias) => (orden.columna === c ? (orden.sentido === 'asc' ? ' ▲' : ' ▼') : '')

  return (
    <div className="space-y-4" data-testid="buscador-guias">
      <div className="grid gap-3 rounded-lg border border-gray-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))]">
        <div className="sm:col-span-2 lg:col-span-1">
          <label htmlFor="q-guias" className="etiqueta">Buscar</label>
          <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500" aria-hidden />
            <input id="q-guias" type="search" className="campo pl-10" placeholder="N.º de guía, orden, pedido, cliente, proveedor, RUC, ruta o placa" value={f.q} onChange={(e) => set('q', e.target.value)} data-testid="buscar-guias" /></div>
        </div>
        <div>
          <label htmlFor="estado-guias" className="etiqueta">Estado</label>
          <select id="estado-guias" className="campo" value={f.estado} onChange={(e) => set('estado', e.target.value as FiltroGuias['estado'])} data-testid="filtro-estado-guia">
            <option value="">Todos</option>
            {ESTADOS_GUIA_BUSQUEDA.map((x) => <option key={x} value={x}>{ETIQUETA_ESTADO_GUIA[x]}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="rol-guias" className="etiqueta">Va a</label>
          <select id="rol-guias" className="campo" value={f.rol} onChange={(e) => set('rol', e.target.value as FiltroGuias['rol'])} data-testid="filtro-rol-guia">
            <option value="">Clientes y proveedores</option><option value="CLIENTE">Clientes</option><option value="PROVEEDOR">Proveedores</option>
          </select>
        </div>
        <div><label htmlFor="desde-guias" className="etiqueta">Desde</label><input id="desde-guias" type="date" className="campo tabular" value={f.desde} max={f.hasta || undefined} onChange={(e) => set('desde', e.target.value)} data-testid="guias-desde" /></div>
        <div><label htmlFor="hasta-guias" className="etiqueta">Hasta</label><input id="hasta-guias" type="date" className="campo tabular" value={f.hasta} min={f.desde || undefined} onChange={(e) => set('hasta', e.target.value)} data-testid="guias-hasta" /></div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-gray-700">
        <p data-testid="guias-contador" aria-live="polite">{vistas.length === guias.length ? `${guias.length} ${guias.length === 1 ? 'guía' : 'guías'}` : `${vistas.length} de ${guias.length} guías`}</p>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="orden-guias" className="etiqueta !mb-0">Ordenar por</label>
          <select id="orden-guias" className="campo !w-auto" value={orden.columna} onChange={(e) => ordenarPor(e.target.value as ColumnaOrdenGuias)} data-testid="orden-guias">
            {COLUMNAS.map((c) => <option key={c.id} value={c.id}>{c.titulo}</option>)}
          </select>
          {hayFiltro && <button type="button" className="btn-secondary" onClick={() => setF(FILTRO_GUIAS_VACIO)} data-testid="guias-limpiar">Quitar filtros</button>}
        </div>
      </div>

      {guias.length === 0 ? (
        <p className="rounded-lg border border-gray-200 bg-white px-4 py-8 text-center text-gray-700" data-testid="guias-vacio"><FileSearch className="mx-auto mb-2 h-8 w-8 text-gray-400" aria-hidden />Todavía no hay guías. Aparecen aquí cuando se emite o se registra la primera.</p>
      ) : vistas.length === 0 ? (
        <p className="rounded-lg border border-gray-200 bg-white px-4 py-8 text-center text-gray-700" data-testid="guias-sin-coincidencias">Ninguna guía coincide con lo que buscas. Prueba con menos filtros.</p>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-lg border border-gray-200 bg-white md:block">
            <table className="w-full min-w-[68rem] text-left text-sm" data-testid="tabla-guias">
              <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-700">
                <tr>
                  {COLUMNAS.slice(0, 2).map((c) => <th key={c.id} scope="col" className="px-3 py-2" aria-sort={orden.columna === c.id ? (orden.sentido === 'asc' ? 'ascending' : 'descending') : undefined}><button type="button" className="font-semibold uppercase" onClick={() => ordenarPor(c.id)}>{c.titulo}{flecha(c.id)}</button></th>)}
                  <th scope="col" className="px-3 py-2">Orden / Pedido</th>
                  <th scope="col" className="px-3 py-2" aria-sort={orden.columna === 'destinatario' ? (orden.sentido === 'asc' ? 'ascending' : 'descending') : undefined}><button type="button" className="font-semibold uppercase" onClick={() => ordenarPor('destinatario')}>Destinatario{flecha('destinatario')}</button></th>
                  <th scope="col" className="px-3 py-2" aria-sort={orden.columna === 'estado' ? (orden.sentido === 'asc' ? 'ascending' : 'descending') : undefined}><button type="button" className="font-semibold uppercase" onClick={() => ordenarPor('estado')}>Estado{flecha('estado')}</button></th>
                  <th scope="col" className="px-3 py-2">Ruta · vehículo · conductor</th>
                  <th scope="col" className="px-3 py-2 text-right">Bultos · peso</th>
                  <th scope="col" className="px-3 py-2">Origen</th>
                  <th scope="col" className="px-3 py-2"><span className="sr-only">PDF</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {vistas.map((g) => (
                  <tr key={g.id} data-testid="fila-guia" className={g.anulada ? 'bg-gray-50 text-gray-600' : ''}>
                    <td className="px-3 py-2 font-medium tabular text-gray-900" data-testid="guia-numero">{g.numero}</td>
                    <td className="px-3 py-2 tabular">{fecha(g.fecha)}{g.fechaTraslado && g.fechaTraslado !== g.fecha ? <span className="block text-xs text-gray-600">traslado {fecha(g.fechaTraslado)}</span> : null}</td>
                    <td className="px-3 py-2"><Link href={`/salidas/${g.salidaId}`} className="font-medium text-gray-900 underline-offset-2 hover:underline" data-testid="guia-orden">{g.salidaNumero}</Link>{g.pedidoNumero && <span className="block text-xs text-gray-600">{g.pedidoNumero}</span>}</td>
                    <td className="px-3 py-2"><span className="block text-gray-900" data-testid="guia-destinatario">{g.destinatario ?? '—'}</span><span className="block text-xs text-gray-600">{ROL[g.rolDestinatario]}{g.ruc ? ` · RUC ${g.ruc}` : ''}</span></td>
                    <td className="px-3 py-2"><ChipEstadoGuia estado={estadoDeGuia(g)} />{g.anulada && g.motivoAnulacion && <span className="mt-1 block text-xs text-gray-600">{g.motivoAnulacion}</span>}</td>
                    <td className="px-3 py-2">{g.rutaNumero ?? '—'}<span className="block text-xs text-gray-600">{[g.placa, g.conductor].filter(Boolean).join(' · ') || 'sin vehículo ni conductor'}</span></td>
                    <td className="px-3 py-2 text-right tabular">{g.bultos ?? '—'}{g.pesoKg != null ? <span className="block text-xs text-gray-600">{g.pesoKg.toLocaleString('es-PE')} kg</span> : null}</td>
                    <td className="px-3 py-2 text-xs text-gray-700">{ETIQUETA_ORIGEN[g.origen]}{g.entorno && <span className="block">{NOMBRE_MODO[g.entorno]}</span>}</td>
                    <td className="px-3 py-2">{g.enlace ? <a href={g.enlace} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-teal-800 underline-offset-2 hover:underline" aria-label={`Abrir el PDF de la guía ${g.numero}`}><ExternalLink className="h-4 w-4" aria-hidden />PDF</a> : <span className="text-xs text-gray-500">sin PDF</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="space-y-3 md:hidden" data-testid="tarjetas-guias">
            {vistas.map((g) => (
              <li key={g.id} className={`rounded-lg border border-gray-200 bg-white p-3 ${g.anulada ? 'bg-gray-50' : ''}`} data-testid="tarjeta-guia">
                <div className="flex flex-wrap items-start justify-between gap-2"><p className="font-medium tabular text-gray-900">{g.numero}</p><ChipEstadoGuia estado={estadoDeGuia(g)} /></div>
                <p className="mt-1 text-gray-900">{g.destinatario ?? '—'} <span className="text-sm text-gray-600">· {ROL[g.rolDestinatario]}</span></p>
                <p className="text-sm text-gray-700">{fecha(g.fecha)} · <Link href={`/salidas/${g.salidaId}`} className="underline">{g.salidaNumero}</Link>{g.pedidoNumero ? ` · ${g.pedidoNumero}` : ''}</p>
                <p className="text-sm text-gray-700">{[g.rutaNumero, g.placa, g.conductor].filter(Boolean).join(' · ') || 'Sin ruta todavía'}{g.bultos != null ? ` · ${g.bultos} bultos` : ''}</p>
                {g.enlace && <a href={g.enlace} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-sm text-teal-800 underline">Abrir PDF<ExternalLink className="h-4 w-4" aria-hidden /></a>}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
