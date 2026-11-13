'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarClock, ChevronDown, Clock, FileSpreadsheet, Hourglass, PackageSearch, RefreshCw, Search, TriangleAlert } from 'lucide-react'
import { formatoFechaHora } from '@/domain/fechas'
import {
  AVISO_PIE_STOCK, TEXTO_SIN_STOCK, claveVence, fechaLote, filtrarProductos, lotesQueVencen, resumenStock, textoDias, textoPlazo, urgenciaLote,
  type LoteStock, type ProductoStock, type RespuestaStockCliente,
} from '@/domain/stock-cliente'
import { vistaPropietario } from '../propietarios-color'

type Datos = Extract<RespuestaStockCliente, { estado: 'OK' }>
const nf = new Intl.NumberFormat('es-PE')
const u = (n: number) => `${nf.format(n)} u`

/** La página del cliente: su stock por producto y lote (sin ubicaciones), lo que vence como filtro del mismo recorrido, y su Kardex descargable. Solo lectura. */
export function StockCliente({ token, prefijo, datos }: { token: string; prefijo: string; datos: Datos }) {
  const router = useRouter()
  const [actualizando, actualizar] = useTransition()
  const [texto, setTexto] = useState('')
  const [grupo, setGrupo] = useState<'TODO' | string>('TODO')
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set())

  const { tramos, productos } = datos
  const resumen = useMemo(() => resumenStock(productos, tramos), [productos, tramos])
  const grupos = useMemo(() => lotesQueVencen(productos, tramos), [productos, tramos])
  const v = vistaPropietario(datos.cliente.codigo)

  const visibles = useMemo(() => {
    const porTexto = filtrarProductos(productos, texto)
    if (grupo === 'TODO') return porTexto.map((p) => ({ p, lotes: p.lotes }))
    return porTexto.map((p) => ({ p, lotes: p.lotes.filter((l) => claveVence(l, tramos) === grupo) })).filter((x) => x.lotes.length > 0)
  }, [productos, texto, grupo, tramos])

  const alternar = (id: string) => setAbiertos((a) => { const n = new Set(a); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const seguirFiltro = grupo !== 'TODO'

  if (productos.length === 0) {
    return (
      <div className="space-y-6">
        <Cabecera datos={datos} letra={v.letra} color={v.color} actualizando={actualizando} onActualizar={() => actualizar(() => router.refresh())} />
        <div className="rounded-lg border border-gray-200 bg-white px-6 py-12 text-center" data-testid="stock-vacio">
          <PackageSearch className="mx-auto h-10 w-10 text-gray-500" aria-hidden />
          <p className="mt-3 text-lg font-medium text-gray-900">{TEXTO_SIN_STOCK}</p>
          <p className="mt-1 text-gray-700">Cuando Logisalud reciba tu mercadería, la verás aquí.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Cabecera datos={datos} letra={v.letra} color={v.color} actualizando={actualizando} onActualizar={() => actualizar(() => router.refresh())} />

      <section aria-labelledby="h-resumen" className="space-y-3" data-testid="stock-resumen">
        <h2 id="h-resumen" className="sr-only">Resumen y lo que vence</h2>
        <p className="text-lg text-gray-900">
          Tienes <strong className="tabular font-semibold">{nf.format(resumen.unidades)} unidades</strong> en <strong className="tabular font-semibold">{resumen.productos} {resumen.productos === 1 ? 'producto' : 'productos'}</strong>;
          pueden salir hoy <strong className="tabular font-semibold" data-testid="stock-disponible-total">{nf.format(resumen.disponibles)}</strong>.
          {resumen.enRevision > 0 && <span className="text-gray-700"> {nf.format(resumen.enRevision)} siguen en revisión de Calidad.</span>}
        </p>
        <div role="group" aria-label="Filtrar por vencimiento" className="flex flex-wrap gap-2" data-testid="stock-filtros-vence">
          <FiltroBoton activo={grupo === 'TODO'} onClick={() => setGrupo('TODO')} testid="filtro-todo">Todo el stock <span className="tabular opacity-80">{u(resumen.unidades)}</span></FiltroBoton>
          {grupos.map((g) => (
            <FiltroBoton key={g.clave} activo={grupo === g.clave} onClick={() => setGrupo(grupo === g.clave ? 'TODO' : g.clave)} tono={g.clave === 'VENCIDO' ? 'rojo' : 'ambar'} testid={`filtro-${g.clave}`}
              icono={g.clave === 'VENCIDO' ? <TriangleAlert className="h-4 w-4" aria-hidden /> : <Clock className="h-4 w-4" aria-hidden />}>
              {g.titulo} <span className="tabular opacity-80">{u(g.unidades)}</span>
            </FiltroBoton>
          ))}
        </div>
        {grupos.length === 0 && <p className="text-gray-700" data-testid="stock-nada-vence">Ningún lote vence en los próximos {textoPlazo(tramos[tramos.length - 1] ?? 365)}.</p>}
      </section>

      <section aria-labelledby="h-productos" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="h-productos" className="font-heading text-2xl font-semibold uppercase tracking-wide text-gray-900">{seguirFiltro ? grupos.find((g) => g.clave === grupo)?.titulo ?? 'Tus productos' : 'Tus productos'}</h2>
          <div className="relative w-full sm:w-80">
            <label htmlFor="stock-buscar" className="sr-only">Buscar por producto, código o lote</label>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500" aria-hidden />
            <input id="stock-buscar" type="search" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar producto, código o lote" className="campo pl-10" autoComplete="off" data-testid="stock-buscar" />
          </div>
        </div>

        {visibles.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white px-6 py-10 text-center" role="status" data-testid="stock-sin-resultados">
            <p className="text-lg font-medium text-gray-900">No encontramos productos con esa búsqueda.</p>
            <button type="button" className="btn-secondary mt-3" onClick={() => { setTexto(''); setGrupo('TODO') }}>Ver todo mi stock</button>
          </div>
        ) : (
          <ul className="divide-y divide-gray-200 overflow-hidden rounded-lg border border-gray-200 bg-white" data-testid="stock-productos">
            <li aria-hidden className="hidden bg-gray-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-600 md:grid md:grid-cols-[minmax(0,1fr)_7rem_7rem_13rem_1.25rem] md:gap-4">
              <span>Producto</span><span className="text-right">En almacén</span><span className="text-right">Disponible</span><span>Vencimiento</span><span />
            </li>
            {visibles.map(({ p, lotes }) => (
              <Producto key={p.productoId} p={p} lotes={lotes} tramos={tramos} abierto={seguirFiltro || abiertos.has(p.productoId)} onAlternar={() => alternar(p.productoId)} />
            ))}
          </ul>
        )}
      </section>

      <KardexPanel token={token} prefijo={prefijo} productos={productos} />

      <p className="text-sm text-gray-600" data-testid="stock-aviso">{AVISO_PIE_STOCK}</p>
    </div>
  )
}

function Cabecera({ datos, letra, color, actualizando, onActualizar }: { datos: Datos; letra: string; color: string; actualizando: boolean; onActualizar: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3" data-testid="stock-cabecera">
      <div className="flex items-center gap-3">
        <span aria-hidden className="flex h-11 w-11 items-center justify-center rounded-md text-xl font-bold text-white" style={{ background: color }}>{letra}</span>
        <div>
          <p className="font-heading text-xl font-semibold tracking-wide text-gray-900" data-testid="stock-cliente">{datos.cliente.nombre}</p>
          <p className="text-sm text-gray-700">Actualizado al <span className="tabular" data-testid="stock-actualizado">{formatoFechaHora(datos.actualizadoEn)}</span></p>
        </div>
      </div>
      <button type="button" className="btn-secondary" onClick={onActualizar} disabled={actualizando} data-testid="stock-actualizar">
        <RefreshCw className={`h-5 w-5 ${actualizando ? 'animate-spin' : ''}`} aria-hidden />{actualizando ? 'Actualizando…' : 'Actualizar'}
      </button>
    </div>
  )
}

function FiltroBoton({ activo, onClick, children, icono, tono = 'neutro', testid }: { activo: boolean; onClick: () => void; children: React.ReactNode; icono?: React.ReactNode; tono?: 'neutro' | 'ambar' | 'rojo'; testid: string }) {
  const base = 'inline-flex min-h-11 items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/60'
  const reposo = tono === 'rojo' ? 'border-red-200 bg-red-50 text-red-900 hover:bg-red-100' : tono === 'ambar' ? 'border-amber-300 bg-amber-50 text-amber-950 hover:bg-amber-100' : 'border-gray-300 bg-white text-gray-900 hover:bg-gray-50'
  const puesto = tono === 'rojo' ? 'border-red-800 bg-red-800 text-white' : tono === 'ambar' ? 'border-amber-800 bg-amber-800 text-white' : 'border-gray-900 bg-gray-900 text-white'
  return <button type="button" aria-pressed={activo} onClick={onClick} className={`${base} ${activo ? puesto : reposo}`} data-testid={testid}>{icono}{children}</button>
}

function Producto({ p, lotes, tramos, abierto, onAlternar }: { p: ProductoStock; lotes: LoteStock[]; tramos: readonly number[]; abierto: boolean; onAlternar: () => void }) {
  const peor = p.lotes.filter((l) => l.vencido).length ? 'VENCIDO' : p.lotes.some((l) => urgenciaLote(l, tramos) === 'PRONTO') ? 'PRONTO' : 'VIGENTE'
  const proximo = p.lotes.filter((l) => !l.vencido && l.dias !== undefined).sort((a, b) => (a.dias ?? 0) - (b.dias ?? 0))[0]
  const id = `prod-${p.productoId}`
  return (
    <li data-testid={`stock-producto-${p.codigo}`}>
      <button type="button" onClick={onAlternar} aria-expanded={abierto} aria-controls={`${id}-lotes`}
        className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-2 px-4 py-3 text-left hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-500/60 md:grid-cols-[minmax(0,1fr)_7rem_7rem_13rem_1.25rem] md:items-center">
        <span className="min-w-0">
          <span className="block font-medium text-gray-900">{p.descripcion}</span>
          <span className="block text-sm text-gray-700">
            <span className="tabular">{p.codigoCliente ?? p.codigo}</span>{p.presentacion ? ` · ${p.presentacion}` : ''}{p.codigoCliente ? <span className="text-gray-500"> · Logisalud {p.codigo}</span> : null}
          </span>
        </span>
        <ChevronDown className={`h-5 w-5 shrink-0 text-gray-600 transition-transform md:order-last md:col-start-5 md:row-start-1 ${abierto ? 'rotate-180' : ''}`} aria-hidden />
        <span className="col-span-2 grid grid-cols-2 gap-x-4 md:contents">
          <Cifra etiqueta="En almacén" valor={p.stock} />
          <Cifra etiqueta="Disponible" valor={p.disponible} />
          <span className="col-span-2 mt-1 flex flex-wrap items-center gap-1.5 md:col-span-1 md:mt-0">
            {p.vencido > 0 && <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-900"><TriangleAlert className="h-3.5 w-3.5" aria-hidden />{u(p.vencido)} vencidas</span>}
            {peor === 'PRONTO' && proximo && <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-950"><Clock className="h-3.5 w-3.5" aria-hidden />{textoDias(proximo.dias, false)}</span>}
            {peor === 'VIGENTE' && proximo && <span className="text-sm text-gray-700">{textoDias(proximo.dias, false)}</span>}
            {p.enRevision > 0 && <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-900"><Hourglass className="h-3.5 w-3.5" aria-hidden />{u(p.enRevision)} en revisión</span>}
          </span>
        </span>
      </button>
      {abierto && (
        <div id={`${id}-lotes`} className="border-t border-gray-100 bg-gray-50 px-3 py-3 sm:px-4" data-testid={`stock-lotes-${p.codigo}`}>
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Lotes de {p.descripcion}</caption>
            <thead className="text-xs uppercase tracking-wide text-gray-600"><tr>
              <th scope="col" className="py-1.5 pr-2 font-semibold sm:pr-3">Lote</th><th scope="col" className="py-1.5 pr-2 font-semibold sm:pr-3">Vencimiento</th>
              <th scope="col" className="py-1.5 pr-2 text-right font-semibold sm:pr-3">Stock</th><th scope="col" className="py-1.5 text-right font-semibold">Disponible</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-200">
              {lotes.map((l) => <FilaLote key={l.loteId} l={l} tramos={tramos} />)}
            </tbody>
          </table>
        </div>
      )}
    </li>
  )
}

function Cifra({ etiqueta, valor }: { etiqueta: string; valor: number }) {
  return (
    <span className="flex items-baseline justify-between gap-2 md:block md:text-right">
      <span className="text-xs uppercase tracking-wide text-gray-600 md:sr-only">{etiqueta}</span>
      <span className="tabular text-lg font-semibold text-gray-900 md:text-base">{nf.format(valor)}</span>
    </span>
  )
}

function FilaLote({ l, tramos }: { l: LoteStock; tramos: readonly number[] }) {
  const urg = urgenciaLote(l, tramos)
  return (
    <tr data-testid={`stock-lote-${l.lote}`} data-urgencia={urg}>
      <td className="py-2 pr-2 align-top sm:pr-3"><span className="tabular font-medium text-gray-900">{l.lote}</span>
        {l.enRevision > 0 && <span className="mt-1 flex items-center gap-1 text-xs text-indigo-900"><Hourglass className="h-3.5 w-3.5" aria-hidden />{u(l.enRevision)} en revisión de Calidad</span>}
      </td>
      <td className="whitespace-nowrap py-2 pr-2 align-top sm:pr-3">
        <span className="tabular block text-gray-900">{fechaLote(l.vence)}</span>
        {urg === 'VENCIDO' && <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-900"><TriangleAlert className="h-3.5 w-3.5" aria-hidden />{textoDias(l.dias, true)}</span>}
        {urg === 'PRONTO' && <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-950"><Clock className="h-3.5 w-3.5" aria-hidden />{textoDias(l.dias, false)}</span>}
        {urg === 'VIGENTE' && <span className="block text-xs text-gray-600">{textoDias(l.dias, false)}</span>}
        {urg === 'SIN_FECHA' && <span className="block text-xs text-gray-600">Sin fecha de vencimiento</span>}
      </td>
      <td className="tabular py-2 pr-2 text-right align-top text-gray-900 sm:pr-3">{nf.format(l.stock)}</td>
      <td className="tabular py-2 text-right align-top font-medium text-gray-900">{nf.format(l.disponible)}</td>
    </tr>
  )
}

/** Descarga del Kardex en Excel (el modelo de Logisalud, sin ubicaciones): un producto o todos, y un rango de fechas opcional. */
function KardexPanel({ token, prefijo, productos }: { token: string; prefijo: string; productos: readonly ProductoStock[] }) {
  return (
    <section aria-labelledby="h-kardex" className="rounded-lg border border-gray-200 bg-white p-4 sm:p-5" data-testid="stock-kardex">
      <h2 id="h-kardex" className="font-heading text-2xl font-semibold uppercase tracking-wide text-gray-900">Tu Kardex</h2>
      <p className="mt-1 max-w-2xl text-gray-700">Entradas, salidas y saldo de tus productos, con el modelo de Kardex de Logisalud. Se descarga en Excel, con una hoja por producto.</p>
      <form method="get" action={`${prefijo}/stock/${token}/kardex`} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_1fr_1fr_auto] lg:items-end" data-testid="stock-kardex-form">
        <div>
          <label htmlFor="kx-producto" className="etiqueta">Producto</label>
          <select id="kx-producto" name="producto" className="campo" defaultValue="" data-testid="kardex-producto">
            <option value="">Todos mis productos</option>
            {productos.map((p) => <option key={p.productoId} value={p.productoId}>{p.codigoCliente ? `${p.codigoCliente} · ` : ''}{p.descripcion}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="kx-desde" className="etiqueta">Desde</label>
          <input id="kx-desde" name="desde" type="date" className="campo" data-testid="kardex-desde" />
        </div>
        <div>
          <label htmlFor="kx-hasta" className="etiqueta">Hasta</label>
          <input id="kx-hasta" name="hasta" type="date" className="campo" data-testid="kardex-hasta" />
        </div>
        <button type="submit" className="btn-primary sm:col-span-2 lg:col-span-1" data-testid="kardex-descargar"><FileSpreadsheet className="h-5 w-5" aria-hidden />Descargar Kardex</button>
      </form>
      <p className="mt-2 flex items-center gap-1.5 text-sm text-gray-600"><CalendarClock className="h-4 w-4" aria-hidden />Sin fechas: desde el primer movimiento hasta hoy.</p>
    </section>
  )
}
