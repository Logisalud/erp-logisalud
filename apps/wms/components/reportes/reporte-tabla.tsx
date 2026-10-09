'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Bookmark, ChevronRight, Download, FileSpreadsheet, SearchX, Trash2, X } from 'lucide-react'
import { borrarVistaAccion, guardarVistaAccion } from '@/app/acciones-inventario'
import type { VistaGuardada } from '@/domain/inventario'
import { REPORTES, aplicarFiltros, ordenATexto, ordenDeTexto, ordenarFilas, resumenDe, totalesPorTramo, valorTexto, type FilaReporte, type Filtros, type IdReporte, type Orden } from '@/domain/reportes'
import { PILDORA_ACTIVA, PILDORA_INACTIVA_HOVER } from '../estilos-opcion'
import { Aviso } from '../entradas/aviso'
import { useAccion } from '../usar-accion'

/** Un reporte: filtros, vistas guardadas, tabla (PC y tablet) o tarjetas (teléfono) y descarga en CSV o Excel. */
export function ReporteTabla({ id, filas, vistas, opciones, filtrosIniciales, ordenInicial = null, tramosOrden }: {
  id: IdReporte; filas: FilaReporte[]; vistas: VistaGuardada[]; opciones: Record<string, string[]>; filtrosIniciales: Filtros; ordenInicial?: Orden | null; tramosOrden?: string[]
}) {
  const def = REPORTES[id]
  const { pendiente, mensaje, ejecutar } = useAccion()
  const [f, setF] = useState<Filtros>(filtrosIniciales)
  const [orden, setOrden] = useState<Orden | null>(ordenInicial)
  const [activa, setActiva] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [nombre, setNombre] = useState('')
  const [limite, setLimite] = useState(100)
  const [verFiltros, setVerFiltros] = useState(false)

  const visibles = useMemo(() => {
    return ordenarFilas(def, aplicarFiltros(def, filas, f), orden)
  }, [def, filas, f, orden])
  // Los tramos: total de lotes y unidades con los demás filtros puestos (sin el del propio tramo).
  const chips = useMemo(() => (tramosOrden ? totalesPorTramo(aplicarFiltros(def, filas, { ...f, tramo: '' }), tramosOrden) : null), [def, filas, f, tramosOrden])
  const resumen = useMemo(() => resumenDe(def, visibles), [def, visibles])
  const hayFiltros = Object.values(f).some((v) => v.trim())
  const query = new URLSearchParams(Object.entries(f).filter(([, v]) => v.trim()))
  if (orden) query.set('orden', ordenATexto(orden))
  const href = (formato: 'csv' | 'xlsx') => { const q = new URLSearchParams(query); q.set('formato', formato); return `/reportes/${id.toLowerCase()}/exportar?${q.toString()}` }
  const poner = (clave: string, v: string) => { setF((p) => ({ ...p, [clave]: v })); setActiva(null); setLimite(100) }
  const titulo = def.columnas.find((c) => c.titulo) ?? def.columnas[0]
  const resto = def.columnas.filter((c) => c !== titulo)

  return (
    <div className="space-y-4">
      {chips && (
        <section aria-label="Tramos de vencimiento" data-testid="tramos">
          <ul className="flex gap-2 overflow-x-auto pb-1 md:flex-wrap md:overflow-visible">
            <li className="shrink-0">
              <button type="button" aria-pressed={!f.tramo} onClick={() => poner('tramo', '')} className={`flex min-h-16 flex-col items-start justify-center rounded-xl border px-4 py-2 text-left ${!f.tramo ? PILDORA_ACTIVA : PILDORA_INACTIVA_HOVER}`} data-testid="tramo-todos">
                <span className="text-sm font-medium">Todos</span><span className="tabular text-xs">{chips.reduce((n, c) => n + c.lotes, 0).toLocaleString('es-PE')} lotes · {chips.reduce((n, c) => n + c.unidades, 0).toLocaleString('es-PE')} u</span>
              </button>
            </li>
            {chips.filter((c) => c.lotes > 0 || f.tramo === c.tramo || c.tramo !== 'Sin fecha').map((c) => (
              <li key={c.tramo} className="shrink-0">
                <button type="button" aria-pressed={f.tramo === c.tramo} onClick={() => poner('tramo', f.tramo === c.tramo ? '' : c.tramo)} className={`flex min-h-16 flex-col items-start justify-center rounded-xl border px-4 py-2 text-left ${f.tramo === c.tramo ? PILDORA_ACTIVA : PILDORA_INACTIVA_HOVER}`} data-testid="tramo-chip" data-tramo={c.tramo}>
                  <span className="text-sm font-medium">{c.tramo}</span><span className="tabular text-xs">{c.lotes.toLocaleString('es-PE')} {c.lotes === 1 ? 'lote' : 'lotes'} · {c.unidades.toLocaleString('es-PE')} u</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3 rounded-xl border border-gray-200 bg-white p-4" aria-label="Filtros" data-testid="reporte-filtros">
        <button type="button" className="btn-secondary btn-sm md:hidden" aria-expanded={verFiltros} onClick={() => setVerFiltros((v) => !v)} data-testid="reporte-filtros-abrir">{verFiltros ? 'Ocultar filtros' : `Filtros${Object.values(f).some((v) => v.trim()) ? ' (activos)' : ''}`}</button>
        <div className={`${verFiltros ? 'grid' : 'hidden'} gap-3 sm:grid-cols-2 md:grid ${def.filtros.filter((d) => !('oculto' in d && d.oculto)).length >= 5 ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}`}>
          {def.filtros.filter((d) => !('oculto' in d && d.oculto)).map((d) => (
            <div key={d.clave}>
              <label htmlFor={`f-${d.clave}`} className="etiqueta">{d.etiqueta}</label>
              {d.tipo === 'texto' ? <input id={`f-${d.clave}`} type="search" className="campo" autoComplete="off" value={f[d.clave] ?? ''} onChange={(e) => poner(d.clave, e.target.value)} placeholder={d.clave === 'q' ? 'Nombre, código, lote o ubicación' : undefined} data-testid={`filtro-${d.clave}`} />
                : d.tipo === 'seleccion' ? (
                  <select id={`f-${d.clave}`} className="campo" value={f[d.clave] ?? ''} onChange={(e) => poner(d.clave, e.target.value)} data-testid={`filtro-${d.clave}`}>
                    <option value="">Todos</option>
                    {(opciones[d.clave] ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : <input id={`f-${d.clave}`} type="date" className="campo" value={f[d.clave] ?? ''} onChange={(e) => poner(d.clave, e.target.value)} data-testid={`filtro-${d.clave}`} />}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3" data-testid="reporte-vistas">
          <span className="inline-flex items-center gap-1.5 text-sm text-gray-700"><Bookmark className="h-4 w-4" aria-hidden />Mis vistas</span>
          {vistas.length === 0 && <span className="text-sm text-gray-700">Todavía no guardaste ninguna.</span>}
          {vistas.map((v) => (
            <span key={v.id} className={`inline-flex items-center rounded-full border ${activa === v.id ? PILDORA_ACTIVA : PILDORA_INACTIVA_HOVER}`}>
              <button type="button" onClick={() => { const { _orden, ...resto } = v.filtros; setF(resto); setOrden(ordenDeTexto(def, _orden) ?? ordenInicial); setActiva(v.id) }} aria-pressed={activa === v.id} className="min-h-11 rounded-l-full pl-4 pr-2 text-sm" data-testid="reporte-vista">{v.nombre}</button>
              <button type="button" disabled={pendiente} onClick={() => ejecutar(() => borrarVistaAccion(v.id), { exito: 'Vista borrada.', alExito: () => { if (activa === v.id) setActiva(null) } })} className="inline-flex min-h-11 w-10 items-center justify-center rounded-r-full text-gray-700 hover:bg-gray-100" aria-label={`Borrar la vista ${v.nombre}`} data-testid="reporte-vista-borrar"><Trash2 className="h-4 w-4" aria-hidden /></button>
            </span>
          ))}
          {!guardando ? <button type="button" className="btn-secondary btn-sm" onClick={() => setGuardando(true)} data-testid="reporte-guardar-vista">Guardar esta vista</button> : (
            <span className="flex flex-wrap items-center gap-2">
              <label htmlFor="nombre-vista-rep" className="sr-only">Nombre de la vista</label>
              <input id="nombre-vista-rep" className="campo !min-h-11 w-48 text-sm" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre de la vista" autoComplete="off" autoFocus data-testid="reporte-vista-nombre" />
              <button type="button" className="btn-primary btn-sm" disabled={pendiente || !nombre.trim()} onClick={() => ejecutar(() => guardarVistaAccion(id, nombre, { ...Object.fromEntries(Object.entries(f).filter(([, v]) => v.trim())), ...(orden ? { _orden: ordenATexto(orden) } : {}) }), { exito: `Guardamos la vista «${nombre.trim()}».`, alExito: () => { setNombre(''); setGuardando(false) } })} data-testid="reporte-vista-confirmar">Guardar</button>
              <button type="button" className="btn-secondary btn-sm" onClick={() => setGuardando(false)}>Cancelar</button>
            </span>
          )}
          {hayFiltros && <button type="button" className="ml-auto inline-flex min-h-11 items-center gap-1.5 px-2 text-sm text-gray-800 underline underline-offset-2" onClick={() => { setF({}); setActiva(null); setOrden(ordenInicial) }} data-testid="reporte-limpiar"><X className="h-4 w-4" aria-hidden />Quitar filtros</button>}
        </div>
        {mensaje && <Aviso tipo={mensaje.tipo === 'ok' ? 'ok' : 'error'}>{mensaje.texto}</Aviso>}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="tabular text-sm text-gray-900" data-testid="reporte-resumen" aria-live="polite">
          <strong>{resumen.filas.toLocaleString('es-PE')}</strong> {resumen.filas === 1 ? 'fila' : 'filas'}{resumen.sumas.map((s) => ` · ${s.etiqueta}: ${s.total.toLocaleString('es-PE')}`).join('')}
          {resumen.extra && <span className="block font-medium" data-testid="reporte-extra">{resumen.extra}</span>}
        </p>
        <div className="flex gap-2">
          <a href={href('csv')} className="btn-secondary btn-sm" data-testid="exportar-csv"><Download className="h-4 w-4" aria-hidden />CSV</a>
          <a href={href('xlsx')} className="btn-secondary btn-sm" data-testid="exportar-xlsx"><FileSpreadsheet className="h-4 w-4" aria-hidden />Excel</a>
        </div>
      </div>

      {visibles.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white px-6 py-12 text-center" data-testid="reporte-vacio">
          <SearchX className="mx-auto h-9 w-9 text-gray-400" aria-hidden />
          <p className="mt-3 font-medium text-gray-900">{filas.length === 0 ? 'Todavía no hay nada que mostrar' : 'Ninguna fila coincide con tus filtros'}</p>
          <p className="mt-1 text-sm text-gray-700">{filas.length === 0 ? 'Cuando haya datos para este reporte, aparecerán aquí.' : 'Prueba quitando algún filtro.'}</p>
        </div>
      ) : (
        <>
          {/* PC y tablet: tabla */}
          <div className="hidden overflow-x-auto rounded-xl border border-gray-200 bg-white md:block" data-testid="reporte-tabla">
            <table className="w-full text-left text-[13px] xl:text-sm">
              <thead className="bg-gray-100 text-gray-800">
                <tr>
                  {def.columnas.map((c) => (
                    <th key={c.clave} scope="col" aria-sort={orden?.clave === c.clave ? (orden.asc ? 'ascending' : 'descending') : 'none'} className={`px-3 py-2.5 font-semibold ${c.tipo === 'numero' || c.tipo === 'porcentaje' ? 'text-right' : ''}`}>
                      <button type="button" onClick={() => setOrden((o) => (o?.clave === c.clave ? { clave: c.clave, asc: !o.asc } : { clave: c.clave, asc: true }))} className="inline-flex min-h-9 items-center gap-1 text-left" data-testid={`ordenar-${c.clave}`}>
                        {c.etiqueta}{orden?.clave === c.clave && (orden.asc ? <ArrowUp className="h-3.5 w-3.5" aria-hidden /> : <ArrowDown className="h-3.5 w-3.5" aria-hidden />)}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visibles.slice(0, limite).map((r, i) => (
                  <tr key={i} data-testid="reporte-fila">
                    {def.columnas.map((c) => { const href = c.enlace?.(r); return <td key={c.clave} className={`px-3 py-2 text-gray-900 ${c.tipo === 'numero' || c.tipo === 'porcentaje' ? 'tabular text-right' : c.tipo === 'fecha' ? 'tabular whitespace-nowrap' : ''}`}>{href ? <Link href={href} className="underline underline-offset-2" data-testid="reporte-enlace-celda">{valorTexto(c, r[c.clave])}</Link> : valorTexto(c, r[c.clave])}</td> })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Teléfono: una tarjeta por fila */}
          <ul className="space-y-2 md:hidden" data-testid="reporte-tarjetas">
            {visibles.slice(0, limite).map((r, i) => (
              def.movil ? <FilaMovilVista key={i} m={def.movil(r)} /> : <li key={i} className="rounded-xl border border-gray-200 bg-white p-3" data-testid="reporte-tarjeta">
                <p className="font-medium text-gray-900">{valorTexto(titulo, r[titulo.clave])}</p>
                <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                  {resto.filter((c) => r[c.clave] !== null && r[c.clave] !== '').map((c) => <div key={c.clave}><dt className="text-xs text-gray-700">{c.etiqueta}</dt><dd className={`text-gray-900 ${c.tipo === 'numero' ? 'tabular' : ''}`}>{valorTexto(c, r[c.clave])}</dd></div>)}
                </dl>
              </li>
            ))}
          </ul>
          {visibles.length > limite && (
            <div className="text-center">
              <p className="text-sm text-gray-700">Mostrando {limite.toLocaleString('es-PE')} de {visibles.length.toLocaleString('es-PE')}. La descarga trae todas.</p>
              <button type="button" className="btn-secondary mt-2" onClick={() => setLimite((l) => l + 200)} data-testid="reporte-ver-mas">Ver más</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

/** Teléfono: una fila compacta, sin desplazamiento horizontal. */
function FilaMovilVista({ m }: { m: import('@/domain/reportes').FilaMovil }) {
  const cuerpo = (
    <>
      <span className="min-w-0 flex-1">
        <strong className="block truncate text-[15px] font-semibold text-gray-900">{m.titulo}</strong>
        {m.lineas.map((l, i) => <span key={i} className="tabular block truncate text-sm text-gray-800">{l}</span>)}
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        {m.fin && <span className="tabular text-sm font-medium text-gray-900">{m.fin}</span>}
        {m.aviso && <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-900">{m.aviso}</span>}
      </span>
      {m.enlace && <ChevronRight className="h-5 w-5 shrink-0 text-gray-400" aria-hidden />}
    </>
  )
  return (
    <li className="rounded-xl border border-gray-200 bg-white" data-testid="reporte-tarjeta">
      {m.enlace ? <Link href={m.enlace} className="flex min-h-16 items-center gap-3 px-3 py-2.5 active:bg-gray-50">{cuerpo}</Link> : <div className="flex min-h-16 items-center gap-3 px-3 py-2.5">{cuerpo}</div>}
    </li>
  )
}
