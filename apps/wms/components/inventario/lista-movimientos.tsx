'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowDown, ArrowRight, ArrowUp, Bookmark, ListFilter, SearchX, Trash2, X } from 'lucide-react'
import { borrarVistaAccion, guardarVistaAccion } from '@/app/acciones-inventario'
import { ETIQUETA_ESTADO_ORDEN, type EstadoOrden, type VistaGuardada } from '@/domain/inventario'
import {
  FILTROS_VACIOS, ORDEN_INICIAL, filtrarMovimientos, hayFiltros, leerVista, ordenarMovimientos, serializarVista,
  type ColumnaMovimiento, type FilaMovimiento, type FiltrosMovimientos, type OrdenColumna,
} from '@/domain/movimientos-lista'
import { formatoFechaHora } from '@/domain/fechas'
import { PILDORA_ACTIVA, PILDORA_INACTIVA_HOVER } from '../estilos-opcion'
import { useAccion } from '../usar-accion'
import { Aviso } from '../entradas/aviso'
import { ChipOrden } from './chips-inventario'
import { Buscador } from './mover/piezas'

const COLUMNAS: { col: ColumnaMovimiento; titulo: string; num?: boolean }[] = [
  { col: 'numero', titulo: 'Referencia' }, { col: 'fecha', titulo: 'Fecha' }, { col: 'desde', titulo: 'Desde' }, { col: 'hacia', titulo: 'Hacia' },
  { col: 'propietario', titulo: 'Propietario' }, { col: 'unidades', titulo: 'Líneas y unidades', num: true },
  { col: 'ejecutor', titulo: 'Ejecutado por' }, { col: 'verificador', titulo: 'Verificado por' }, { col: 'estado', titulo: 'Estado' },
]
/** «8 oct, 18:01» en hora de Lima: la tabla no lleva el año (el detalle sí). */
const fechaCorta = (iso: string) => new Date(iso).toLocaleString('es-PE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Lima' })
const ESTADOS: EstadoOrden[] = ['EJECUTADO', 'CON_DIFERENCIA', 'CONFIRMADO', 'ANULADO']

/** La lista de movimientos internos: tabla en PC y tablet, filas compactas en el teléfono. Búsqueda, filtros, orden y vistas guardadas. */
export function ListaMovimientos({ filas, vistas, mios, qInicial = '' }: { filas: FilaMovimiento[]; vistas: VistaGuardada[]; mios: string[]; qInicial?: string }) {
  const router = useRouter()
  const { pendiente, mensaje, ejecutar } = useAccion()
  const [f, setF] = useState<FiltrosMovimientos>({ ...FILTROS_VACIOS, q: qInicial })
  const [orden, setOrden] = useState<OrdenColumna>(ORDEN_INICIAL)
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false)
  const [nombre, setNombre] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [activa, setActiva] = useState<string | null>(null)
  const esMio = useMemo(() => new Set(mios), [mios])

  const propietarios = useMemo(() => Array.from(new Set(filas.flatMap((x) => x.propietarios))).sort((a, b) => a.localeCompare(b, 'es')), [filas])
  const ejecutores = useMemo(() => Array.from(new Set(filas.map((x) => x.ejecutor))).sort((a, b) => a.localeCompare(b, 'es')), [filas])
  const visibles = useMemo(() => ordenarMovimientos(filtrarMovimientos(filas, f, esMio), orden), [filas, f, orden, esMio])
  const totalFiltros = Object.entries(f).filter(([k, v]) => k !== 'q' && !!v).length

  const cambiar = (c: Partial<FiltrosMovimientos>) => { setF((a) => ({ ...a, ...c })); setActiva(null) }
  const ordenarPor = (col: ColumnaMovimiento) => { setOrden((o) => (o.col === col ? { col, dir: o.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: col === 'fecha' ? 'desc' : 'asc' })); setActiva(null) }
  const aplicar = (v: VistaGuardada) => { const r = leerVista(v.filtros); setF(r.filtros); setOrden(r.orden); setActiva(v.id) }
  const limpiar = () => { setF(FILTROS_VACIOS); setOrden(ORDEN_INICIAL); setActiva(null) }
  const guardar = () => ejecutar(() => guardarVistaAccion('MOVIMIENTOS', nombre, serializarVista(f, orden)), { exito: `Guardamos la vista «${nombre.trim()}».`, alExito: () => { setNombre(''); setGuardando(false) } })
  const borrar = (v: VistaGuardada) => ejecutar(() => borrarVistaAccion(v.id), { exito: 'Vista borrada.', alExito: () => { if (activa === v.id) setActiva(null) } })
  const abrir = (id: string) => router.push(`/movimientos/${id}`)

  const sel = 'campo !min-h-11 text-sm'
  return (
    <div className="space-y-4" data-testid="lista-movimientos">
      {/* Búsqueda + filtros */}
      <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
        <Buscador id="q-mov" etiqueta="Buscar movimientos" ayuda="Por referencia, producto, lote, ubicación o persona." valor={f.q} onCambio={(q) => cambiar({ q })} testid="mov-buscar" />
        <div className="flex flex-wrap items-center gap-2">
          {mios.length > 0 && <button type="button" aria-pressed={f.mios} onClick={() => cambiar({ mios: !f.mios })} className={`min-h-11 rounded-full border px-4 text-sm font-medium ${f.mios ? PILDORA_ACTIVA : PILDORA_INACTIVA_HOVER}`} data-testid="mov-filtro-mios">Me tocan ({mios.length})</button>}
          <button type="button" onClick={() => setFiltrosAbiertos((a) => !a)} aria-expanded={filtrosAbiertos} aria-controls="mov-filtros" className="btn-secondary btn-sm md:hidden" data-testid="mov-abrir-filtros">
            <ListFilter className="h-4 w-4" aria-hidden />Filtros{totalFiltros > 0 ? ` (${totalFiltros})` : ''}
          </button>
          {(hayFiltros(f) || orden !== ORDEN_INICIAL) && <button type="button" className="btn-secondary btn-sm" onClick={limpiar} data-testid="mov-limpiar"><X className="h-4 w-4" aria-hidden />Quitar filtros</button>}
        </div>
        <div id="mov-filtros" className={`${filtrosAbiertos ? 'grid' : 'hidden'} gap-3 sm:grid-cols-2 md:grid md:grid-cols-3 xl:grid-cols-6`} data-testid="mov-filtros">
          <div><label htmlFor="f-estado" className="etiqueta">Estado</label>
            <select id="f-estado" className={sel} value={f.estado} onChange={(e) => cambiar({ estado: e.target.value as FiltrosMovimientos['estado'] })} data-testid="mov-f-estado">
              <option value="">Todos</option>{ESTADOS.map((e) => <option key={e} value={e}>{ETIQUETA_ESTADO_ORDEN[e]}</option>)}
            </select></div>
          <div><label htmlFor="f-desde" className="etiqueta">Desde</label><input id="f-desde" type="date" className={sel} value={f.desde} onChange={(e) => cambiar({ desde: e.target.value })} data-testid="mov-f-desde" /></div>
          <div><label htmlFor="f-hasta" className="etiqueta">Hasta</label><input id="f-hasta" type="date" className={sel} value={f.hasta} onChange={(e) => cambiar({ hasta: e.target.value })} data-testid="mov-f-hasta" /></div>
          <div><label htmlFor="f-prop" className="etiqueta">Propietario</label>
            <select id="f-prop" className={sel} value={f.propietario} onChange={(e) => cambiar({ propietario: e.target.value })} data-testid="mov-f-propietario">
              <option value="">Todos</option>{propietarios.map((p) => <option key={p} value={p}>{p}</option>)}
            </select></div>
          <div><label htmlFor="f-ejec" className="etiqueta">Ejecutado por</label>
            <select id="f-ejec" className={sel} value={f.ejecutor} onChange={(e) => cambiar({ ejecutor: e.target.value })} data-testid="mov-f-ejecutor">
              <option value="">Todos</option>{ejecutores.map((p) => <option key={p} value={p}>{p}</option>)}
            </select></div>
          <div><label htmlFor="f-ubic" className="etiqueta">Ubicación</label><input id="f-ubic" className={sel} value={f.ubicacion} placeholder="A-10, B-2…" autoComplete="off" onChange={(e) => cambiar({ ubicacion: e.target.value })} data-testid="mov-f-ubicacion" /></div>
          <div className="md:hidden sm:col-span-2"><label htmlFor="f-orden" className="etiqueta">Ordenar por</label>
            <select id="f-orden" className={sel} value={`${orden.col}:${orden.dir}`} onChange={(e) => { const [col, dir] = e.target.value.split(':'); setOrden({ col: col as ColumnaMovimiento, dir: dir as 'asc' | 'desc' }); setActiva(null) }} data-testid="mov-f-orden">
              {[...COLUMNAS, { col: 'lineas' as ColumnaMovimiento, titulo: 'Líneas', num: true }].flatMap((c) => (['asc', 'desc'] as const).map((d) => <option key={`${c.col}:${d}`} value={`${c.col}:${d}`}>{c.titulo} ({c.col === 'fecha' ? (d === 'asc' ? 'más antiguo' : 'más reciente') : c.num ? (d === 'asc' ? 'menor' : 'mayor') : d === 'asc' ? 'A-Z' : 'Z-A'})</option>))}
            </select></div>
        </div>
        {/* Vistas guardadas */}
        <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3" data-testid="mov-vistas">
          <span className="inline-flex items-center gap-1.5 text-sm text-gray-700"><Bookmark className="h-4 w-4" aria-hidden />Mis vistas</span>
          {vistas.length === 0 && <span className="text-sm text-gray-600">Todavía no guardaste ninguna.</span>}
          {vistas.map((v) => (
            <span key={v.id} className={`inline-flex items-center rounded-full border text-sm font-medium ${activa === v.id ? PILDORA_ACTIVA : PILDORA_INACTIVA_HOVER}`}>
              <button type="button" onClick={() => aplicar(v)} aria-pressed={activa === v.id} className="min-h-11 rounded-l-full pl-4 pr-2" data-testid="mov-vista">{v.nombre}</button>
              <button type="button" onClick={() => borrar(v)} disabled={pendiente} className="inline-flex min-h-11 w-10 items-center justify-center rounded-r-full text-gray-700 hover:bg-gray-100" aria-label={`Borrar la vista ${v.nombre}`} data-testid="mov-vista-borrar"><Trash2 className="h-4 w-4" aria-hidden /></button>
            </span>
          ))}
          {!guardando
            ? <button type="button" className="btn-secondary btn-sm" onClick={() => setGuardando(true)} data-testid="mov-guardar-vista">Guardar esta vista</button>
            : (
              <span className="flex flex-wrap items-center gap-2">
                <label htmlFor="nombre-vista" className="sr-only">Nombre de la vista</label>
                <input id="nombre-vista" className="campo !min-h-11 w-48 text-sm" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre de la vista" autoComplete="off" autoFocus data-testid="mov-vista-nombre" />
                <button type="button" className="btn-primary btn-sm" disabled={pendiente || !nombre.trim()} onClick={guardar} data-testid="mov-vista-confirmar">Guardar</button>
                <button type="button" className="btn-secondary btn-sm" onClick={() => { setGuardando(false); setNombre('') }}>Cancelar</button>
              </span>
            )}
        </div>
        {mensaje && <Aviso tipo={mensaje.tipo === 'ok' ? 'ok' : 'error'}>{mensaje.texto}</Aviso>}
      </div>

      <p className="text-sm text-gray-700" aria-live="polite" data-testid="mov-conteo">{visibles.length === filas.length ? `${filas.length} ${filas.length === 1 ? 'movimiento' : 'movimientos'}` : `${visibles.length} de ${filas.length} movimientos`}</p>

      {visibles.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white px-6 py-12 text-center" data-testid="mov-sin-resultados">
          <SearchX className="mx-auto h-9 w-9 text-gray-400" aria-hidden />
          <p className="mt-3 font-medium text-gray-900">Ningún movimiento coincide</p>
          <p className="mt-1 text-sm text-gray-600">Prueba con menos filtros o con otra palabra.</p>
          <button type="button" className="btn-secondary mt-4" onClick={limpiar}>Quitar filtros</button>
        </div>
      ) : (
        <>
          {/* PC y tablet: tabla */}
          <div className="hidden overflow-x-auto rounded-lg border border-gray-200 bg-white md:block">
            <table className="w-full text-[13px] xl:text-sm" data-testid="tabla-movimientos">
              <caption className="sr-only">Movimientos internos</caption>
              <thead className="border-b border-gray-200 bg-gray-50 text-left text-gray-700">
                <tr>
                  {COLUMNAS.map((c) => {
                    const on = orden.col === c.col
                    return (
                      <th key={c.col} scope="col" aria-sort={on ? (orden.dir === 'asc' ? 'ascending' : 'descending') : 'none'} className={`whitespace-nowrap px-2 py-1.5 font-medium ${c.num ? 'text-right' : ''}`}>
                        <button type="button" onClick={() => ordenarPor(c.col)} className={`inline-flex min-h-10 items-center gap-1 rounded px-1 underline-offset-4 hover:bg-gray-100 hover:underline ${c.num ? 'flex-row-reverse' : ''}`} title={`Ordenar por ${c.titulo.toLowerCase()}`} data-testid={`ordenar-${c.col}`}>
                          {c.titulo}{on ? (orden.dir === 'asc' ? <ArrowUp className="h-3.5 w-3.5" aria-hidden /> : <ArrowDown className="h-3.5 w-3.5" aria-hidden />)   : null}
                        </button>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visibles.map((x) => (
                  <tr key={x.id} onClick={() => abrir(x.id)} className="cursor-pointer hover:bg-gray-50" data-testid="fila-movimiento">
                    <td className="px-2 py-3"><Link href={`/movimientos/${x.id}`} onClick={(e) => e.stopPropagation()} className="tabular whitespace-nowrap font-heading text-sm font-semibold tracking-wide text-gray-900 underline-offset-2 hover:underline" data-testid="enlace-movimiento">{x.numero}</Link></td>
                    <td className="tabular px-2 py-3 text-gray-800">{fechaCorta(x.fecha)}</td>
                    <td className="tabular px-2 py-3 font-medium text-gray-900">{x.desde}</td>
                    <td className="tabular px-2 py-3 font-medium text-gray-900">{x.hacia}</td>
                    <td className="px-2 py-3 text-gray-800">{x.propietario}</td>
                    <td className="tabular px-2 py-3 text-right text-gray-800" data-testid="celda-lineas-unidades">{x.lineas} {x.lineas === 1 ? 'línea' : 'líneas'}<span className="hidden xl:inline"> · </span><span className="block font-medium text-gray-900 xl:inline">{x.unidades.toLocaleString('es-PE')} u</span></td>
                    <td className="px-2 py-3 text-gray-800">{x.ejecutor}</td>
                    <td className="px-2 py-3 text-gray-800">{x.verificador ?? <span className="text-gray-600">pendiente</span>}</td>
                    <td className="px-2 py-3"><ChipOrden estado={x.estado} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Teléfono: una fila compacta por movimiento, sin desplazamiento horizontal */}
          <ul className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 bg-white md:hidden" data-testid="lista-movimientos-movil">
            {visibles.map((x) => (
              <li key={x.id}>
                <Link href={`/movimientos/${x.id}`} className="block space-y-1 px-4 py-3 active:bg-gray-50" data-testid="fila-movimiento-movil">
                  <span className="flex items-center justify-between gap-2"><span className="tabular font-heading text-lg font-semibold tracking-wide text-gray-900">{x.numero}</span><ChipOrden estado={x.estado} /></span>
                  <span className="tabular flex flex-wrap items-center gap-x-2 font-medium text-gray-900">{x.desde}<ArrowRight className="h-4 w-4 text-gray-500" aria-hidden />{x.hacia}<span className="ml-auto text-sm text-gray-700">{x.lineas} {x.lineas === 1 ? 'línea' : 'líneas'} · {x.unidades.toLocaleString('es-PE')} u</span></span>
                  <span className="block truncate text-sm text-gray-700">{x.productos.length === 1 ? x.productos[0] : `${x.productos.length} productos`} · {x.propietario}</span>
                  <span className="block text-xs text-gray-600">Ejecutó {x.ejecutor} · {formatoFechaHora(x.fecha)}{x.verificador ? ` · verificó ${x.verificador}` : ''}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
