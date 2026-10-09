'use client'

import { useEffect, useState } from 'react'
import { MapPin, Package, SearchX, X } from 'lucide-react'
import { buscarOrigenAccion, buscarProductoAccion, contenidoOrigenAccion, ubicacionesProductoAccion, type ContenidoOrigen } from '@/app/acciones-inventario'
import type { CeldaDeProducto, ResultadoOrigen, ResultadoProducto } from '@/domain/inventario'
import { PILDORA_ACTIVA, PILDORA_INACTIVA_HOVER } from '../../estilos-opcion'
import { useBusqueda } from '../usar-busqueda'
import { PanelCeldas, type CeldaElegida } from './panel-celdas'
import { Buscador, nLineas, nUnidades } from './piezas'

type Modo = 'producto' | 'ubicacion'

/** Dos maneras de agregar líneas: buscando el PRODUCTO (y viendo dónde está) o partiendo de una UBICACIÓN (y viendo qué hay). */
export function AgregarLineas({ enMovimiento, alAgregar, origenDefecto }: { enMovimiento: Set<string>; alAgregar: (e: CeldaElegida[]) => void; origenDefecto: { posicionId: string; codigo: string } | null }) {
  const [modo, setModo] = useState<Modo>('producto')
  return (
    <div className="space-y-4" data-testid="mover-agregar-lineas">
      <div role="group" aria-label="Cómo quieres agregar" className="grid grid-cols-2 gap-2">
        {([['producto', 'Por producto', Package], ['ubicacion', 'Por ubicación', MapPin]] as const).map(([m, texto, Icono]) => (
          <button key={m} type="button" aria-pressed={modo === m} onClick={() => setModo(m)} data-testid={`modo-${m}`}
            className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border-2 px-3 font-medium ${modo === m ? PILDORA_ACTIVA : PILDORA_INACTIVA_HOVER}`}>
            <Icono className="h-5 w-5" aria-hidden />{texto}
          </button>
        ))}
      </div>
      {modo === 'producto' ? <PorProducto enMovimiento={enMovimiento} alAgregar={alAgregar} origenDefecto={origenDefecto} /> : <PorUbicacion enMovimiento={enMovimiento} alAgregar={alAgregar} origenDefecto={origenDefecto} />}
    </div>
  )
}

function PorProducto({ enMovimiento, alAgregar, origenDefecto }: { enMovimiento: Set<string>; alAgregar: (e: CeldaElegida[]) => void; origenDefecto: { posicionId: string; codigo: string } | null }) {
  const [q, setQ] = useState('')
  const [elegido, setElegido] = useState<ResultadoProducto | null>(null)
  const [celdas, setCeldas] = useState<CeldaDeProducto[] | null>(null)
  const [cargando, setCargando] = useState(false)
  const [verTodas, setVerTodas] = useState(false)
  const r = useBusqueda<ResultadoProducto>(q, buscarProductoAccion, !elegido)
  const soloOrigen = !!origenDefecto && !verTodas
  const visibles = celdas && soloOrigen ? celdas.filter((c) => c.posicionId === origenDefecto!.posicionId) : celdas

  async function elegir(p: ResultadoProducto) {
    setCargando(true)
    const c = await ubicacionesProductoAccion(p.productoId)
    setCargando(false)
    setElegido(p); setCeldas(c)
  }
  const volver = () => { setElegido(null); setCeldas(null); setQ(''); setVerTodas(false) }

  if (elegido) {
    return (
      <div className="space-y-3" data-testid="mover-producto-elegido">
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-300 bg-white px-4 py-3">
          <Package className="h-5 w-5 text-gray-500" aria-hidden />
          <span className="min-w-0 flex-1"><span className="block font-medium text-gray-900">{elegido.descripcion}</span><span className="tabular block text-sm text-gray-600">{elegido.codigo} · está en {elegido.ubicaciones} {elegido.ubicaciones === 1 ? 'ubicación' : 'ubicaciones'}</span></span>
          <button type="button" className="btn-secondary btn-sm" onClick={volver} data-testid="mover-cambiar-producto"><X className="h-4 w-4" aria-hidden />Otro producto</button>
        </div>
        {soloOrigen
          ? <p className="text-sm text-gray-700" data-testid="mover-solo-origen">Mostrando solo lo que hay en <strong>{origenDefecto!.codigo}</strong> (tu origen por defecto). <button type="button" className="underline" onClick={() => setVerTodas(true)} data-testid="mover-ver-todas">Ver todas las ubicaciones</button></p>
          : <p className="text-sm text-gray-700">Marca de dónde sacar y cuánto. Primero lo que vence antes.{origenDefecto && <> <button type="button" className="underline" onClick={() => setVerTodas(false)}>Solo {origenDefecto.codigo}</button></>}</p>}
        {visibles && visibles.length === 0 && <p className="rounded-lg border border-dashed border-gray-300 bg-white px-4 py-5 text-sm text-gray-700" data-testid="mover-nada-en-origen">Este producto no está en {origenDefecto?.codigo}.</p>}
        {visibles && visibles.length > 0 && <PanelCeldas celdas={visibles} enMovimiento={enMovimiento} mostrarUbicacion testid="panel-producto" alAgregar={(e) => { alAgregar(e); volver() }} />}
      </div>
    )
  }
  return (
    <div className="space-y-3">
      <Buscador id="q-producto" etiqueta="Producto o lote" ayuda="Por nombre, código, principio activo o número de lote." valor={q} onCambio={setQ} testid="mover-buscar-producto" />
      <div aria-live="polite" className="min-h-5 text-sm text-gray-600" data-testid="mover-estado-producto">{r.cargando || cargando ? 'Buscando…' : r.error ? 'No pudimos buscar. Intenta de nuevo.' : r.resultados && r.resultados.length > 0 ? `${r.resultados.length} ${r.resultados.length === 1 ? 'producto' : 'productos'}` : ''}</div>
      {r.resultados && r.resultados.length === 0 && !r.cargando && (
        <p className="flex items-center gap-2 rounded-lg border border-dashed border-gray-300 bg-white px-4 py-6 text-sm text-gray-700" data-testid="mover-sin-producto"><SearchX className="h-5 w-5 shrink-0 text-gray-400" aria-hidden />Ningún producto con stock coincide con «{q}».</p>
      )}
      <ul className="space-y-2" data-testid="mover-resultados-producto">
        {(r.resultados ?? []).map((p) => (
          <li key={p.productoId}>
            <button type="button" onClick={() => void elegir(p)} disabled={cargando} className="flex min-h-16 w-full items-center gap-3 rounded-lg border border-gray-300 bg-white px-4 py-3 text-left transition duration-fast hover:border-gray-400 hover:shadow-sm active:bg-gray-50" data-testid="mover-producto">
              <Package className="h-5 w-5 shrink-0 text-gray-500" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-gray-900">{p.descripcion}</span>
                <span className="tabular block truncate text-sm text-gray-700">{p.codigo}{p.coincidencias.length ? ` · ${p.coincidencias.join(' · ')}` : ''}</span>
              </span>
              <span className="tabular shrink-0 text-right text-sm text-gray-700"><strong className="block text-base text-gray-900">{nUnidades(p.disponibles)}</strong>{p.ubicaciones} {p.ubicaciones === 1 ? 'ubicación' : 'ubicaciones'}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function PorUbicacion({ enMovimiento, alAgregar, origenDefecto }: { enMovimiento: Set<string>; alAgregar: (e: CeldaElegida[]) => void; origenDefecto: { posicionId: string; codigo: string } | null }) {
  const [q, setQ] = useState('')
  const [origen, setOrigen] = useState<ContenidoOrigen | null>(null)
  const [cargando, setCargando] = useState(false)
  const r = useBusqueda<ResultadoOrigen>(q, buscarOrigenAccion, !origen)
  const [yaQuiso, setYaQuiso] = useState(false)
  // Con un origen por defecto, «Por ubicación» abre directo su contenido.
  useEffect(() => {
    if (!origenDefecto || origen || yaQuiso) return
    let vivo = true
    void contenidoOrigenAccion(origenDefecto.posicionId).then((c) => { if (vivo && c) setOrigen(c) })
    return () => { vivo = false }
  }, [origenDefecto, origen, yaQuiso])

  async function elegir(o: ResultadoOrigen) {
    setCargando(true)
    const c = await contenidoOrigenAccion(o.posicionId)
    setCargando(false)
    if (c) setOrigen(c)
  }
  const volver = () => { setOrigen(null); setQ(''); setYaQuiso(true) }

  if (origen) {
    return (
      <div className="space-y-3" data-testid="mover-origen-elegido">
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-300 bg-white px-4 py-3">
          <MapPin className="h-5 w-5 text-gray-500" aria-hidden />
          <span className="tabular font-heading text-xl font-semibold tracking-wide text-gray-900">{origen.codigo}</span>
          <span className="text-sm text-gray-600">{origen.area} · {nLineas(origen.lineas.length)}</span>
          <button type="button" className="btn-secondary btn-sm ml-auto" onClick={volver} data-testid="mover-cambiar-origen"><X className="h-4 w-4" aria-hidden />Otra ubicación</button>
        </div>
        {origen.bloqueada && <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950" data-testid="mover-origen-bloqueado">Esta ubicación {origen.bloqueada}: no se mueve desde aquí hasta resolverlo.</p>}
        <PanelCeldas
          celdas={origen.lineas.map((l) => ({ ...l, bloqueada: origen.bloqueada }))} enMovimiento={enMovimiento} mostrarUbicacion={false} conMoverTodo testid="panel-ubicacion"
          alAgregar={(e) => { alAgregar(e); volver() }} />
      </div>
    )
  }
  return (
    <div className="space-y-3">
      <Buscador id="q-origen" etiqueta="Ubicación, producto o lote" ayuda="Por ejemplo A-15.1, dapagliflozina o el número de lote." valor={q} onCambio={setQ} testid="mover-buscar-origen" />
      <div aria-live="polite" className="min-h-5 text-sm text-gray-600" data-testid="mover-estado-origen">{r.cargando || cargando ? 'Buscando…' : r.error ? 'No pudimos buscar. Intenta de nuevo.' : r.resultados && r.resultados.length > 0 ? `${r.resultados.length} ${r.resultados.length === 1 ? 'ubicación' : 'ubicaciones'}` : ''}</div>
      {r.resultados && r.resultados.length === 0 && !r.cargando && (
        <p className="flex items-center gap-2 rounded-lg border border-dashed border-gray-300 bg-white px-4 py-6 text-sm text-gray-700" data-testid="mover-sin-origen"><SearchX className="h-5 w-5 shrink-0 text-gray-400" aria-hidden />Ninguna ubicación con stock coincide con «{q}».</p>
      )}
      <ul className="space-y-2" data-testid="mover-resultados-origen">
        {(r.resultados ?? []).map((o) => (
          <li key={o.posicionId}>
            <button type="button" disabled={!!o.bloqueada || cargando} onClick={() => void elegir(o)}
              className={`flex min-h-16 w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition duration-fast ${o.bloqueada ? 'cursor-not-allowed border-gray-200 bg-gray-50 text-gray-500' : 'border-gray-300 bg-white hover:border-gray-400 hover:shadow-sm active:bg-gray-50'}`} data-testid="mover-origen">
              <MapPin className="h-5 w-5 shrink-0 text-gray-500" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="tabular block font-heading text-lg font-semibold tracking-wide text-gray-900">{o.codigo} <span className="font-body text-sm font-normal text-gray-600">· {o.area}</span></span>
                <span className="block truncate text-sm text-gray-700">{o.bloqueada ? `No se puede mover desde aquí: ${o.bloqueada}.` : o.coincidencias.length ? o.coincidencias.join(' · ') : nLineas(o.lineas)}</span>
              </span>
              <span className="tabular shrink-0 text-right text-sm text-gray-700"><strong className="block text-base text-gray-900">{nUnidades(o.unidades)}</strong>{nLineas(o.lineas)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
