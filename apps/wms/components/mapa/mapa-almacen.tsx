'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Layers, Maximize2, RotateCcw, Search, SearchX, TriangleAlert, X, ZoomIn, ZoomOut } from 'lucide-react'
import type { Estado } from '@/domain/tipos'
import { ETIQUETA_ESTADO } from '@/domain/estados'
import { celdaCoincide, unidadesQueCoinciden, type CeldaVista, type VistaMapa } from '@/domain/vista-mapa'
import { MAPA_ALTO, MAPA_ANCHO } from '@/domain/mapa'
import { vistaPropietario } from '../propietarios-color'
import { ChipEstado, ChipPorVerificar } from '../chips'
import { DrawerPosicion } from './drawer-posicion'

export type Capa = 'propietario' | 'estado' | 'ocupacion'

const PASO = 44 // píxeles por celda del mapa (1 celda = 44 unidades SVG, con 4 de separación)
const ANCHO = MAPA_ANCHO * PASO + 24
const ALTO = MAPA_ALTO * PASO + 24

const CAPAS: { id: Capa; etiqueta: string; pregunta: string }[] = [
  { id: 'propietario', etiqueta: 'Propietario', pregunta: '¿De quién es cada ubicación?' },
  { id: 'estado', etiqueta: 'Estado', pregunta: '¿En qué estado está lo que hay?' },
  { id: 'ocupacion', etiqueta: 'Ocupación', pregunta: '¿Qué tan llena está?' },
]

const COLOR_ESTADO: Record<Estado, { fondo: string; borde: string; letra: string }> = {
  CUARENTENA: { fondo: '#E0E7FF', borde: '#4338CA', letra: 'C' },
  DEVOLUCIONES: { fondo: '#FFEDD5', borde: '#C2410C', letra: 'D' },
  APROBADO: { fondo: '#D8F1DF', borde: '#2F7644', letra: 'A' },
  BAJAS_RECHAZADOS: { fondo: '#FEE2E2', borde: '#B91C1C', letra: 'B' },
}

const AREA_COMPARTIDA = new Set(['RECEPCION', 'CUARENTENA', 'EMBALAJE', 'DESPACHO'])
const AREA_ETIQUETA_CORTA: Record<string, string> = { RECEPCION: 'Recep.', CUARENTENA: 'Cuar.', EMBALAJE: 'Emb.', DESPACHO: 'Desp.' }

/** Estado que "gana" en una celda con varios: Cuarentena y Devoluciones (piden acción) > Bajas > Aprobado. */
function estadoDominante(c: CeldaVista): Estado | null {
  if (c.estados.includes('CUARENTENA')) return 'CUARENTENA'
  if (c.estados.includes('DEVOLUCIONES')) return 'DEVOLUCIONES'
  if (c.estados.includes('BAJAS_RECHAZADOS')) return 'BAJAS_RECHAZADOS'
  if (c.estados.includes('APROBADO')) return 'APROBADO'
  return null
}

function aspecto(c: CeldaVista, capa: Capa): { fondo: string; borde: string; guion?: boolean; marca?: string; marcaColor?: string } {
  if (capa === 'propietario') {
    if (AREA_COMPARTIDA.has(c.tipoArea)) return { fondo: '#EDF1EF', borde: '#728079', marca: AREA_ETIQUETA_CORTA[c.tipoArea] }
    if (c.propietarios.length === 0) return { fondo: '#FFFFFF', borde: '#9AA6A0', guion: true, marca: 'libre' }
    const v = vistaPropietario(c.propietarios[0])
    return { fondo: v.tinte, borde: v.color, marca: c.propietarios.length > 1 ? 'varios' : v.letra, marcaColor: v.color }
  }
  if (capa === 'estado') {
    const e = estadoDominante(c)
    if (!e) return { fondo: '#FFFFFF', borde: '#C5CFCA', marca: c.libre ? 'libre' : 'vacía' }
    const m = COLOR_ESTADO[e]
    return { fondo: m.fondo, borde: m.borde, marca: c.estados.length > 1 ? `${m.letra}+` : m.letra, marcaColor: m.borde }
  }
  // ocupación
  if (c.nivelesConStock === 0) return { fondo: '#FFFFFF', borde: '#C5CFCA', marca: c.libre ? 'libre' : `0/${c.niveles}` }
  const f = c.nivelesConStock / c.niveles
  const fondo = f >= 1 ? '#87D3A0' : f >= 0.5 ? '#B2E4C2' : '#D8F1DF'
  return { fondo, borde: '#2F7644', marca: `${c.nivelesConStock}/${c.niveles}`, marcaColor: '#1B4127' }
}

export function MapaAlmacen({
  vista, capaInicial = 'propietario', verInicial, buscarInicial = '',
}: {
  vista: VistaMapa
  capaInicial?: Capa | 'verificar'
  verInicial?: string
  buscarInicial?: string
}) {
  const [capa, setCapa] = useState<Capa>(capaInicial === 'verificar' ? 'propietario' : capaInicial)
  const [soloVerificar, setSoloVerificar] = useState(capaInicial === 'verificar')
  const [consulta, setConsulta] = useState(buscarInicial)
  const [sel, setSel] = useState<string | null>(verInicial ?? null)
  const [filtroProp, setFiltroProp] = useState<string | null>(null)
  const [t, setT] = useState({ k: 1, x: 0, y: 0 })
  const [tamano, setTamano] = useState({ w: 0, h: 0 })
  const contenedor = useRef<HTMLDivElement>(null)
  const arrastre = useRef<{ x: number; y: number; tx: number; ty: number; movio: boolean } | null>(null)
  const ajustado = useRef(false)

  const celdas = vista.celdas
  const porClave = useMemo(() => new Map(celdas.map((c) => [c.clave, c])), [celdas])
  const seleccionada = sel ? porClave.get(sel) ?? null : null

  // Si llega otra búsqueda desde afuera (la búsqueda universal navega a /almacen?buscar=…), se refleja.
  const primera = useRef(true)
  useEffect(() => {
    if (primera.current) { primera.current = false; return }
    setConsulta(buscarInicial)
    setSel(verInicial ?? null)
    setSoloVerificar(capaInicial === 'verificar')
    if (capaInicial !== 'verificar') setCapa(capaInicial)
  }, [buscarInicial, verInicial, capaInicial])

  // ── Sincroniza la URL (capa, búsqueda y selección) para poder compartir el enlace. ──
  // history.replaceState y no router.replace: no vuelve a pedir la pantalla al servidor ni reinicia el mapa.
  useEffect(() => {
    const id = setTimeout(() => {
      const p = new URLSearchParams()
      if (consulta.trim()) p.set('buscar', consulta.trim())
      if (sel) p.set('ver', sel)
      if (soloVerificar) p.set('capa', 'verificar')
      else if (capa !== 'propietario') p.set('capa', capa)
      const qs = p.toString()
      window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : ''))
    }, 250)
    return () => clearTimeout(id)
  }, [consulta, sel, capa, soloVerificar])

  // ── Ajuste al contenedor ──
  const ajustar = useCallback((w = tamano.w, h = tamano.h) => {
    if (!w || !h) return
    const k = Math.min(w / ANCHO, h / ALTO) * 0.98
    setT({ k, x: (w - ANCHO * k) / 2, y: (h - ALTO * k) / 2 })
  }, [tamano.w, tamano.h])

  useEffect(() => {
    const el = contenedor.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth, h = el.clientHeight
      setTamano({ w, h })
      if (!ajustado.current && w > 0 && h > 0) {
        ajustado.current = true
        const k = Math.min(w / ANCHO, h / ALTO) * 0.98
        setT({ k, x: (w - ANCHO * k) / 2, y: (h - ALTO * k) / 2 })
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const zoom = useCallback((factor: number, cx?: number, cy?: number) => {
    setT((a) => {
      const k = Math.min(4, Math.max(0.25, a.k * factor))
      const px = cx ?? tamano.w / 2
      const py = cy ?? tamano.h / 2
      return { k, x: px - ((px - a.x) / a.k) * k, y: py - ((py - a.y) / a.k) * k }
    })
  }, [tamano.w, tamano.h])

  // Rueda: zoom hacia el cursor (listener nativo: React registra wheel como pasivo).
  useEffect(() => {
    const el = contenedor.current
    if (!el) return
    const f = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      zoom(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - r.left, e.clientY - r.top)
    }
    el.addEventListener('wheel', f, { passive: false })
    return () => el.removeEventListener('wheel', f)
  }, [zoom])

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('[data-celda]')) return
    arrastre.current = { x: e.clientX, y: e.clientY, tx: t.x, ty: t.y, movio: false }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const a = arrastre.current
    if (!a) return
    const dx = e.clientX - a.x, dy = e.clientY - a.y
    if (Math.abs(dx) + Math.abs(dy) > 3) a.movio = true
    setT((v) => ({ ...v, x: a.tx + dx, y: a.ty + dy }))
  }
  const onPointerUp = () => { arrastre.current = null }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === '+' || e.key === '=') zoom(1.2)
    else if (e.key === '-') zoom(1 / 1.2)
    else if (e.key === '0') ajustar()
    else if (e.key === 'ArrowLeft') setT((v) => ({ ...v, x: v.x + 40 }))
    else if (e.key === 'ArrowRight') setT((v) => ({ ...v, x: v.x - 40 }))
    else if (e.key === 'ArrowUp') setT((v) => ({ ...v, y: v.y + 40 }))
    else if (e.key === 'ArrowDown') setT((v) => ({ ...v, y: v.y - 40 }))
    else return
    e.preventDefault()
  }

  // ── Filtros y resúmenes ──
  const buscando = consulta.trim().length > 0
  const coincide = useCallback((c: CeldaVista) => {
    if (soloVerificar && !c.porVerificar) return false
    if (filtroProp && !c.propietarios.includes(filtroProp)) return false
    return celdaCoincide(c, consulta)
  }, [consulta, soloVerificar, filtroProp])
  const hayFiltro = buscando || soloVerificar || !!filtroProp
  const resultado = useMemo(() => (buscando ? unidadesQueCoinciden(celdas, consulta) : null), [celdas, consulta, buscando])
  const nCoinciden = hayFiltro ? celdas.filter(coincide).length : celdas.length

  const resumenCapa = useMemo(() => {
    if (capa === 'propietario') {
      return vista.propietarios.map((o) => {
        const cs = celdas.filter((c) => c.propietarios.includes(o.codigo))
        return { clave: o.codigo, titulo: vistaPropietario(o.codigo).corto, detalle: `${cs.length} ubicaciones · ${cs.reduce((n, c) => n + c.unidades, 0).toLocaleString('es-PE')} unidades`, vista: vistaPropietario(o.codigo) }
      })
    }
    if (capa === 'estado') {
      return (['APROBADO', 'CUARENTENA', 'DEVOLUCIONES', 'BAJAS_RECHAZADOS'] as Estado[]).map((e) => {
        let u = 0
        const cs = new Set<string>()
        for (const c of celdas) for (const p of c.posiciones) for (const s of p.stock) if (s.estado === e) { u += s.cantidad; cs.add(c.clave) }
        return { clave: e, estado: e, titulo: ETIQUETA_ESTADO[e], detalle: `${cs.size} ubicaciones · ${u.toLocaleString('es-PE')} unidades` }
      })
    }
    const ocupables = celdas.filter((c) => !AREA_COMPARTIDA.has(c.tipoArea) && !c.libre)
    const llenas = ocupables.filter((c) => c.nivelesConStock === c.niveles).length
    const conAlgo = ocupables.filter((c) => c.nivelesConStock > 0).length
    return [
      { clave: 'con-stock', titulo: 'Con algo de stock', detalle: `${conAlgo} de ${ocupables.length} ubicaciones asignadas` },
      { clave: 'llenas', titulo: 'Con todos sus niveles ocupados', detalle: `${llenas} ubicaciones` },
      { clave: 'vacias', titulo: 'Asignadas y vacías', detalle: `${ocupables.length - conAlgo} ubicaciones` },
    ]
  }, [capa, celdas, vista.propietarios])

  const porRack = useMemo(() => {
    const m = new Map<string, CeldaVista[]>()
    for (const c of celdas) {
      const rack = c.clave.split('-')[0]
      m.set(rack, [...(m.get(rack) ?? []), c])
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([rack, cs]) => ({
      rack, celdas: cs.sort((a, b) => a.clave.localeCompare(b.clave, 'es', { numeric: true })),
    }))
  }, [celdas])

  const seleccionar = (clave: string | null) => setSel(clave)

  return (
    <div className="space-y-4">
      {/* Barra de capas y búsqueda */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-1 items-center gap-2 md:max-w-md">
          <label htmlFor="buscar-mapa" className="sr-only">Buscar en el almacén</label>
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" aria-hidden />
            <input
              id="buscar-mapa" data-testid="buscar-mapa" value={consulta} onChange={(e) => setConsulta(e.target.value)}
              placeholder="Producto, lote o ubicación" className="campo !pl-9 !pr-10" autoComplete="off"
            />
            {consulta && (
              <button type="button" onClick={() => setConsulta('')} aria-label="Borrar búsqueda" className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-gray-600 hover:bg-gray-100">
                <X className="h-4 w-4" aria-hidden />
              </button>
            )}
          </div>
        </div>

        <div role="group" aria-label="Capa del mapa" className="hidden items-center gap-1 rounded-full border border-gray-300 bg-white p-1 md:flex">
          <Layers className="ml-2 mr-1 h-4 w-4 text-gray-500" aria-hidden />
          {CAPAS.map((c) => (
            <button
              key={c.id} type="button" onClick={() => setCapa(c.id)} aria-pressed={capa === c.id} data-testid={`capa-${c.id}`}
              className={`min-h-10 rounded-full px-4 text-sm font-medium transition duration-fast ${capa === c.id ? 'bg-green-100 text-green-900' : 'text-gray-700 hover:bg-gray-100'}`}
            >
              {c.etiqueta}
            </button>
          ))}
        </div>
      </div>

      {/* Resultado de la búsqueda (se anuncia a lectores de pantalla) */}
      <div aria-live="polite" className="min-h-6 text-sm" data-testid="resumen-busqueda">
        {buscando && resultado && resultado.unidades > 0 && (
          <p className="text-gray-800">
            <span className="font-semibold">Encontramos {resultado.unidades.toLocaleString('es-PE')} unidades</span> en {resultado.ubicaciones} {resultado.ubicaciones === 1 ? 'ubicación' : 'ubicaciones'}.
          </p>
        )}
        {buscando && nCoinciden === 0 && (
          <p className="flex items-center gap-2 text-gray-700"><SearchX className="h-4 w-4" aria-hidden />No encontramos “{consulta.trim()}” en el almacén. Prueba con otra parte del nombre o una ubicación como A-10.2.</p>
        )}
        {buscando && resultado && resultado.unidades === 0 && nCoinciden > 0 && (
          <p className="text-gray-700">Hay {nCoinciden} ubicaciones que coinciden por su código o propietario.</p>
        )}
        {soloVerificar && (
          <p className="flex flex-wrap items-center gap-2 text-gray-800">
            <TriangleAlert className="h-4 w-4 text-amber-600" aria-hidden />
            Mostrando solo las ubicaciones por verificar en sitio ({nCoinciden}).
            <button type="button" className="underline" onClick={() => setSoloVerificar(false)}>Ver todas</button>
          </p>
        )}
      </div>

      {/* ── Mapa completo (PC y tablet) ── */}
      <div className="hidden md:block">
        <div className="relative overflow-hidden rounded-lg border border-gray-200 bg-white" style={{ height: 'clamp(520px, calc(100vh - 300px), 760px)' }}>
          <div
            ref={contenedor} tabIndex={0} role="application" aria-label="Mapa del almacén. Usa + y - para acercar, flechas para mover y Enter sobre una ubicación para abrirla."
            data-testid="mapa" onKeyDown={onKey}
            onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
            className="h-full w-full cursor-grab touch-none select-none active:cursor-grabbing"
          >
            <svg width="100%" height="100%" role="presentation">
              <g transform={`translate(${t.x} ${t.y}) scale(${t.k})`}>
                {/* Fondo del plano: pasillos y referencias (aproximadas) */}
                <rect x={0} y={0} width={ANCHO} height={ALTO} rx={10} fill="#F6F8F7" />
                <text x={ANCHO - 12} y={20} textAnchor="end" fontSize={11} fill="#728079">Plano aproximado · sin escala exacta</text>
                <text x={(MAPA_ANCHO - 3) * PASO + 12} y={(MAPA_ALTO) * PASO + 8} fontSize={11} fill="#55625B" fontWeight={600}>Ingreso de mercadería →</text>
                {celdas.map((c) => {
                  const a = aspecto(c, capa)
                  const on = coincide(c)
                  const esSel = sel === c.clave
                  const x = c.x * PASO + 12, y = c.y * PASO + 12, w = PASO - 4, h = PASO - 4
                  const resalta = hayFiltro && on
                  return (
                    <g
                      key={c.clave} data-celda={c.clave} data-coincide={on ? '1' : '0'} role="button" tabIndex={0}
                      aria-label={`${c.clave}. ${c.unidades > 0 ? `${c.unidades} unidades en ${c.nivelesConStock} de ${c.niveles} niveles` : 'Vacía'}${c.propietarios.length ? `. ${c.propietarios.map((p) => vistaPropietario(p).corto).join(', ')}` : ''}${c.porVerificar ? '. Por verificar en sitio' : ''}`}
                      opacity={hayFiltro && !on ? 0.2 : 1} style={{ cursor: 'pointer', outline: 'none' }}
                      onClick={() => { if (!arrastre.current?.movio) seleccionar(c.clave) }}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); seleccionar(c.clave) } }}
                    >
                      <rect
                        x={x} y={y} width={w} height={h} rx={6} fill={a.fondo}
                        stroke={esSel ? '#1A201D' : resalta ? '#3A9BA1' : a.borde} strokeWidth={esSel ? 3.5 : resalta ? 3 : 1.5}
                        strokeDasharray={a.guion ? '4 3' : undefined}
                      />
                      {c.porVerificar && (
                        <g aria-hidden>
                          <polygon points={`${x + 1},${y + 14} ${x + 1},${y + 1} ${x + 14},${y + 1}`} fill="#F59E0B" />
                          <text x={x + 3.2} y={y + 10} fontSize={9} fontWeight={800} fill="#1A201D">!</text>
                        </g>
                      )}
                      <text x={x + w / 2} y={y + 21} textAnchor="middle" fontSize={14} fontWeight={700} fill="#1A201D" className="tabular">{c.clave}</text>
                      {a.marca && (
                        <text x={x + w / 2} y={y + 34} textAnchor="middle" fontSize={10.5} fontWeight={700} fill={a.marcaColor ?? '#55625B'}>{a.marca}</text>
                      )}
                    </g>
                  )
                })}
              </g>
            </svg>
          </div>

          {/* Controles de zoom */}
          <div className="absolute right-3 top-3 flex flex-col overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm">
            <button type="button" onClick={() => zoom(1.25)} aria-label="Acercar" className="flex h-11 w-11 items-center justify-center hover:bg-gray-100"><ZoomIn className="h-5 w-5" aria-hidden /></button>
            <button type="button" onClick={() => zoom(1 / 1.25)} aria-label="Alejar" className="flex h-11 w-11 items-center justify-center border-t border-gray-200 hover:bg-gray-100"><ZoomOut className="h-5 w-5" aria-hidden /></button>
            <button type="button" onClick={() => ajustar()} aria-label="Ajustar a la pantalla" data-testid="ajustar-mapa" className="flex h-11 w-11 items-center justify-center border-t border-gray-200 hover:bg-gray-100"><Maximize2 className="h-5 w-5" aria-hidden /></button>
            <button type="button" onClick={() => setT({ k: 1, x: 12, y: 12 })} aria-label="Tamaño real" className="flex h-11 w-11 items-center justify-center border-t border-gray-200 hover:bg-gray-100"><RotateCcw className="h-5 w-5" aria-hidden /></button>
          </div>
        </div>

        {/* Leyenda con los números de la capa activa */}
        <section aria-label={`Leyenda: ${CAPAS.find((c) => c.id === capa)?.pregunta}`} className="mt-3">
          <p className="mb-2 text-sm font-medium text-gray-800">{CAPAS.find((c) => c.id === capa)?.pregunta}</p>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {resumenCapa.map((r) => {
              const esProp = capa === 'propietario'
              const activo = esProp && filtroProp === r.clave
              const Inner = (
                <>
                  {'vista' in r && r.vista ? (
                    <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-xs font-bold text-white" style={{ background: r.vista.color }}>{r.vista.letra}</span>
                  ) : 'estado' in r && r.estado ? (
                    <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded border-2 text-xs font-bold" style={{ background: COLOR_ESTADO[r.estado].fondo, borderColor: COLOR_ESTADO[r.estado].borde, color: COLOR_ESTADO[r.estado].borde }}>{COLOR_ESTADO[r.estado].letra}</span>
                  ) : null}
                  <span className="min-w-0 text-left">
                    <span className="block truncate text-sm font-medium text-gray-900">{r.titulo}</span>
                    <span className="tabular block truncate text-xs text-gray-600">{r.detalle}</span>
                  </span>
                </>
              )
              return (
                <li key={r.clave}>
                  {esProp ? (
                    <button type="button" aria-pressed={activo} onClick={() => setFiltroProp(activo ? null : r.clave)}
                      className={`flex min-h-12 w-full items-center gap-3 rounded-lg border px-3 py-2 transition duration-fast ${activo ? 'border-teal-500 bg-teal-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                      {Inner}
                    </button>
                  ) : (
                    <div className="flex min-h-12 items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2">{Inner}</div>
                  )}
                </li>
              )
            })}
          </ul>
          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600">
            <span className="inline-flex items-center gap-1.5"><span aria-hidden className="inline-block h-3 w-3 rounded-sm border border-amber-500 bg-amber-400" />“!” = por verificar en sitio</span>
            <span className="inline-flex items-center gap-1.5"><span aria-hidden className="inline-block h-3 w-3 rounded-sm border border-dashed border-gray-500" />Libre = sin propietario asignado</span>
            <span>Plano aproximado: los planos no tienen escala exacta.</span>
          </p>
        </section>
      </div>

      {/* ── Teléfono: búsqueda y ubicación en texto ── */}
      <div className="md:hidden" data-testid="lista-ubicaciones">
        {buscando ? (
          <ResultadosTexto celdas={celdas.filter(coincide)} consulta={consulta} onAbrir={seleccionar} />
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-gray-700">Elige un rack para ver sus ubicaciones, o escribe arriba lo que buscas.</p>
            {porRack.map(({ rack, celdas: cs }) => {
              const visibles = cs.filter(coincide)
              if (visibles.length === 0) return null
              return (
                <details key={rack} className="group rounded-lg border border-gray-200 bg-white">
                  <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4">
                    <span className="font-medium text-gray-900">Rack {rack}</span>
                    <span className="flex items-center gap-2 text-sm text-gray-600">
                      {visibles.filter((c) => c.nivelesConStock > 0).length} de {visibles.length} con stock
                      <ChevronDown className="h-4 w-4 transition group-open:rotate-180" aria-hidden />
                    </span>
                  </summary>
                  <ul className="grid grid-cols-3 gap-2 border-t border-gray-100 p-3">
                    {visibles.map((c) => {
                      const a = aspecto(c, capa)
                      return (
                        <li key={c.clave}>
                          <button type="button" onClick={() => seleccionar(c.clave)}
                            className="flex min-h-14 w-full flex-col items-center justify-center rounded-md border-2 px-1 text-sm font-semibold text-gray-900"
                            style={{ background: a.fondo, borderColor: a.borde, borderStyle: a.guion ? 'dashed' : 'solid' }}>
                            <span className="tabular">{c.clave}</span>
                            <span className="text-[10px] font-bold" style={{ color: a.marcaColor ?? '#55625B' }}>{c.porVerificar ? '! ' : ''}{a.marca}</span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </details>
              )
            })}
          </div>
        )}
      </div>

      {seleccionada && <DrawerPosicion celda={seleccionada} consulta={consulta} onCerrar={() => seleccionar(null)} />}
    </div>
  )
}

/** Resultado en texto para el teléfono: "Dapagliflozina está en A-21.1 (120 u)…" */
function ResultadosTexto({ celdas, consulta, onAbrir }: { celdas: CeldaVista[]; consulta: string; onAbrir: (c: string) => void }) {
  const q = consulta.trim().toLowerCase()
  if (celdas.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6 text-center" data-testid="sin-resultados">
        <SearchX className="mx-auto h-8 w-8 text-gray-400" aria-hidden />
        <p className="mt-2 font-medium text-gray-900">No encontramos “{consulta.trim()}”</p>
        <p className="mt-1 text-sm text-gray-600">Prueba con otra parte del nombre, el código del lote o una ubicación como A-10.2.</p>
      </div>
    )
  }
  return (
    <ul className="space-y-2">
      {celdas.slice(0, 40).map((c) => {
        const filas = c.posiciones.flatMap((p) => p.stock.map((s) => ({ p, s })))
        const coinciden = filas.filter(({ p, s }) => `${s.producto} ${s.productoCodigo} ${s.lote} ${p.codigo}`.toLowerCase().includes(q.split(/\s+/)[0] ?? ''))
        const mostrar = (coinciden.length ? coinciden : filas).slice(0, 3)
        return (
          <li key={c.clave}>
            <button type="button" onClick={() => onAbrir(c.clave)} className="w-full rounded-lg border border-gray-200 bg-white p-3 text-left active:bg-gray-50">
              <span className="flex items-center justify-between gap-2">
                <span className="font-heading text-lg font-semibold tracking-wide text-gray-900">{c.clave}</span>
                <span className="flex gap-1.5">{c.porVerificar && <ChipPorVerificar />}</span>
              </span>
              {mostrar.length === 0 ? (
                <span className="mt-1 block text-sm text-gray-600">Sin stock en esta ubicación</span>
              ) : (
                mostrar.map(({ p, s }, i) => (
                  <span key={i} className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="min-w-0">
                      <span className="block font-medium text-gray-900">{s.producto}</span>
                      <span className="tabular block text-xs text-gray-600">{p.codigo} · lote {s.lote} · {s.cantidad.toLocaleString('es-PE')} u</span>
                    </span>
                    <ChipEstado estado={s.estado} />
                  </span>
                ))
              )}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
