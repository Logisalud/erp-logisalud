'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, CheckCircle2, MapPin, Search, SearchX, Send, TriangleAlert, X } from 'lucide-react'
import { buscarDestinoAccion, buscarOrigenAccion, contenidoOrigenAccion, prepararMovimientoAccion, validarDestinoAccion, type ContenidoOrigen } from '@/app/acciones-inventario'
import type { LineaContenido, ResultadoDestino, ResultadoOrigen, ValidacionDestino } from '@/domain/inventario'
import { ETIQUETA_ESTADO } from '@/domain/estados'
import { formatoFecha } from '@/domain/fechas'
import { PILDORA_ACTIVA, PILDORA_INACTIVA_HOVER } from '../estilos-opcion'
import { vistaPropietario } from '../propietarios-color'
import { useAccion } from '../usar-accion'
import { Aviso } from '../entradas/aviso'
import { useBusqueda } from './usar-busqueda'

const MOTIVOS = ['Acomodo', 'Acercar al despacho', 'Liberar la ubicación', 'Reubicar por espacio']

/** Un buscador grande y claro: escribir da resultados al instante, sin listas desplegables. */
function Buscador({ id, etiqueta, ayuda, valor, onCambio, testid, autoFoco }: { id: string; etiqueta: string; ayuda?: string; valor: string; onCambio: (v: string) => void; testid: string; autoFoco?: boolean }) {
  return (
    <div>
      <label htmlFor={id} className="etiqueta">{etiqueta}</label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500" aria-hidden />
        <input id={id} type="search" inputMode="search" enterKeyHint="search" autoComplete="off" autoCapitalize="characters" spellCheck={false} autoFocus={autoFoco}
          className="campo !min-h-14 !pl-12 text-base md:text-lg" value={valor} onChange={(e) => onCambio(e.target.value)} data-testid={testid} aria-describedby={ayuda ? `${id}-ayuda` : undefined} />
      </div>
      {ayuda && <p id={`${id}-ayuda`} className="mt-1 text-xs text-gray-600">{ayuda}</p>}
    </div>
  )
}

function Estado({ e }: { e: LineaContenido['estado'] }) {
  return <span className="rounded-full border border-gray-300 bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-800">{ETIQUETA_ESTADO[e]}</span>
}

type Marcas = Record<string, string>

/**
 * Mover: se empieza por el ORIGEN (buscas la ubicación, el producto o el lote), se marcan las líneas que salen
 * (cantidad editable, por defecto todo) y se elige UN destino, que se valida al instante. Un solo movimiento por origen y destino.
 */
export function FormMover() {
  const router = useRouter()
  const { pendiente, mensaje, ejecutar } = useAccion()
  const [qOrigen, setQOrigen] = useState('')
  const [origen, setOrigen] = useState<ContenidoOrigen | null>(null)
  const [cargandoOrigen, setCargandoOrigen] = useState(false)
  const [marcas, setMarcas] = useState<Marcas>({})
  const [qDestino, setQDestino] = useState('')
  const [destino, setDestino] = useState<ValidacionDestino | null>(null)
  const [motivo, setMotivo] = useState('')

  const origenes = useBusqueda<ResultadoOrigen>(qOrigen, buscarOrigenAccion, !origen)
  const lineas = origen?.lineas ?? []
  const marcadas = lineas.filter((l) => l.clave in marcas)
  const cantidad = (l: LineaContenido) => Number(marcas[l.clave] ?? 0)
  const errorCantidad = (l: LineaContenido) => {
    if (!(l.clave in marcas)) return undefined
    const n = Number(marcas[l.clave])
    if (!Number.isInteger(n) || n <= 0) return 'Escribe una cantidad mayor que cero.'
    if (n > l.disponible) return `Solo hay ${l.disponible} disponibles.`
    return undefined
  }
  const hayErrorCantidad = marcadas.some((l) => errorCantidad(l))
  const minimas = useMemo(() => marcadas.map((l) => ({ clave: l.clave, posicionId: l.posicionId, propietarioId: l.propietarioId, propietario: l.propietario, estado: l.estado })), [marcadas])
  const destinos = useBusqueda<ResultadoDestino>(qDestino, (q) => buscarDestinoAccion(q, minimas), !!origen && marcadas.length > 0 && !destino)

  async function elegirOrigen(r: ResultadoOrigen, marcarClave?: string) {
    setCargandoOrigen(true)
    const c = await contenidoOrigenAccion(r.posicionId)
    setCargandoOrigen(false)
    if (!c) return
    setOrigen(c); setMarcas({}); setDestino(null); setQDestino('')
    if (marcarClave) setMarcas({ [marcarClave]: '' })
  }
  const cambiarOrigen = () => { setOrigen(null); setMarcas({}); setDestino(null); setQDestino(''); setQOrigen('') }
  const alternar = (l: LineaContenido) => { setDestino(null); setMarcas((m) => { const n = { ...m }; if (l.clave in n) delete n[l.clave]; else n[l.clave] = String(l.disponible); return n }) }
  const moverTodo = () => { setDestino(null); setMarcas(Object.fromEntries(lineas.filter((l) => l.disponible > 0).map((l) => [l.clave, String(l.disponible)]))) }
  const quitarTodo = () => { setDestino(null); setMarcas({}) }

  async function elegirDestino(r: ResultadoDestino) {
    const v = await validarDestinoAccion(r.posicionId, minimas)
    setDestino(v)
  }
  // Si cambian las líneas marcadas, el destino elegido se vuelve a validar.
  const revalidar = async (d: ValidacionDestino, nuevas: typeof minimas) => setDestino(nuevas.length ? await validarDestinoAccion(d.posicionId, nuevas) : null)
  const quitarQueNoCaben = () => {
    if (!destino) return
    const malas = new Set(destino.porLinea.filter((x) => !x.ok).map((x) => x.clave))
    const nuevas = { ...marcas }
    for (const k of malas) delete nuevas[k]
    setMarcas(nuevas)
    void revalidar(destino, minimas.filter((m) => !malas.has(m.clave)))
  }

  const total = marcadas.reduce((n, l) => n + cantidad(l), 0)
  const motivoFinal = motivo.trim()
  const falta = !origen ? 'Elige de dónde sale.' : marcadas.length === 0 ? 'Marca qué se mueve.' : hayErrorCantidad ? 'Corrige las cantidades.' : !destino ? 'Elige el destino.' : !destino.ok ? 'El destino no sirve para todo lo marcado.' : !motivoFinal ? 'Elige o escribe el motivo.' : ''

  function preparar() {
    if (!origen || !destino) return
    ejecutar(() => prepararMovimientoAccion(marcadas.map((l) => ({ desdePosicionId: l.posicionId, haciaPosicionId: destino.posicionId, loteId: l.loteId, estado: l.estado, procedenciaId: l.procedenciaId, cantidad: cantidad(l) })), motivoFinal),
      { exito: 'Movimiento preparado.', refrescar: false, alExito: (r) => router.push(`/movimientos/${r.id}`) })
  }

  return (
    <div className="space-y-6 pb-44 md:pb-24" data-testid="form-mover">
      {/* 1 · Origen */}
      <section aria-labelledby="h-origen" className="space-y-3">
        <h2 id="h-origen" className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">¿De dónde sale?</h2>
        {!origen ? (
          <>
            <Buscador id="q-origen" etiqueta="Ubicación, producto o lote" ayuda="Por ejemplo A-15.1, dapagliflozina o el número de lote." valor={qOrigen} onCambio={setQOrigen} testid="mover-buscar-origen" autoFoco />
            <div aria-live="polite" className="min-h-6 text-sm text-gray-600" data-testid="mover-estado-origen">{origenes.cargando ? 'Buscando…' : origenes.error ? 'No pudimos buscar. Intenta de nuevo.' : origenes.resultados && origenes.resultados.length > 0 ? `${origenes.resultados.length} ${origenes.resultados.length === 1 ? 'ubicación' : 'ubicaciones'}` : ''}</div>
            {origenes.resultados && origenes.resultados.length === 0 && !origenes.cargando && (
              <p className="flex items-center gap-2 rounded-lg border border-dashed border-gray-300 bg-white px-4 py-6 text-sm text-gray-700" data-testid="mover-sin-origen"><SearchX className="h-5 w-5 shrink-0 text-gray-400" aria-hidden />Ninguna ubicación con stock coincide con «{qOrigen}».</p>
            )}
            <ul className="space-y-2" data-testid="mover-resultados-origen">
              {(origenes.resultados ?? []).map((r) => (
                <li key={r.posicionId}>
                  <button type="button" disabled={!!r.bloqueada || cargandoOrigen} onClick={() => elegirOrigen(r)} className={`flex min-h-16 w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition duration-fast ${r.bloqueada ? 'cursor-not-allowed border-gray-200 bg-gray-50 text-gray-500' : 'border-gray-300 bg-white hover:border-gray-400 hover:shadow-sm active:bg-gray-50'}`} data-testid="mover-origen">
                    <MapPin className="h-5 w-5 shrink-0 text-gray-500" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="tabular block font-heading text-lg font-semibold tracking-wide text-gray-900">{r.codigo} <span className="font-body text-sm font-normal text-gray-600">· {r.area}</span></span>
                      <span className="block truncate text-sm text-gray-700">{r.bloqueada ? `No se puede mover desde aquí: ${r.bloqueada}.` : r.coincidencias.length ? r.coincidencias.join(' · ') : `${r.lineas} ${r.lineas === 1 ? 'línea' : 'líneas'}`}</span>
                    </span>
                    <span className="tabular shrink-0 text-right text-sm text-gray-700"><strong className="block text-base text-gray-900">{r.unidades.toLocaleString('es-PE')} u</strong>{r.lineas} {r.lineas === 1 ? 'línea' : 'líneas'}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-300 bg-white px-4 py-3" data-testid="mover-origen-elegido">
            <MapPin className="h-5 w-5 text-gray-500" aria-hidden />
            <span className="tabular font-heading text-xl font-semibold tracking-wide text-gray-900">{origen.codigo}</span>
            <span className="text-sm text-gray-600">{origen.area} · {lineas.length} {lineas.length === 1 ? 'línea' : 'líneas'}</span>
            <button type="button" className="btn-secondary btn-sm ml-auto" onClick={cambiarOrigen} data-testid="mover-cambiar-origen"><X className="h-4 w-4" aria-hidden />Cambiar</button>
          </div>
        )}
      </section>

      {/* 2 · Qué se mueve */}
      {origen && (
        <section aria-labelledby="h-que" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="h-que" className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">¿Qué se mueve?</h2>
            <div className="flex gap-2">
              <button type="button" className="btn-secondary btn-sm" onClick={moverTodo} data-testid="mover-todo">Mover todo</button>
              {marcadas.length > 0 && <button type="button" className="btn-secondary btn-sm" onClick={quitarTodo} data-testid="mover-quitar-todo">Quitar todo</button>}
            </div>
          </div>
          {origen.bloqueada && <Aviso tipo="atencion" testid="mover-origen-bloqueado">Esta ubicación {origen.bloqueada}: no se mueve desde aquí hasta resolverlo.</Aviso>}
          {lineas.length === 0 ? <p className="text-sm text-gray-600">Esta ubicación no tiene unidades.</p> : (
            <ul className="space-y-2" data-testid="mover-lineas">
              {lineas.map((l) => {
                const on = l.clave in marcas
                const err = errorCantidad(l)
                const v = vistaPropietario(l.propietario)
                const ocupada = l.disponible === 0
                return (
                  <li key={l.clave} className={`rounded-lg border ${on ? PILDORA_ACTIVA : PILDORA_INACTIVA_HOVER} ${ocupada || origen.bloqueada ? 'opacity-60' : ''}`} data-testid="mover-linea">
                    <label className="flex min-h-16 cursor-pointer items-start gap-3 px-4 py-3">
                      <input type="checkbox" className="mt-1 h-6 w-6 shrink-0 accent-green-600" checked={on} disabled={ocupada || !!origen.bloqueada} onChange={() => alternar(l)} aria-label={`Mover ${l.producto}, lote ${l.lote}`} data-testid="mover-marcar" />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-gray-900">{l.producto}</span>
                        <span className="tabular block text-sm text-gray-700">Lote {l.lote} · vence {formatoFecha(l.vence)}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-2 text-xs"><Estado e={l.estado} /><span className="inline-flex items-center gap-1.5 text-gray-700"><span aria-hidden className="flex h-4 w-4 items-center justify-center rounded text-[10px] font-bold text-white" style={{ background: v.color }}>{v.letra}</span>{v.corto}</span></span>
                      </span>
                      <span className="tabular shrink-0 text-right text-sm text-gray-700"><strong className="block text-base text-gray-900">{l.disponible} u</strong>{ocupada ? 'reservadas' : l.disponible < l.cantidad ? `de ${l.cantidad}` : 'disponibles'}</span>
                    </label>
                    {on && (
                      <div className="flex flex-wrap items-center gap-2 border-t border-green-200 px-4 pb-3 pt-2.5">
                        <label htmlFor={`cant-${l.clave}`} className="text-sm text-gray-800">Cantidad a mover</label>
                        <input id={`cant-${l.clave}`} className="campo tabular !min-h-12 w-28 text-base" inputMode="numeric" pattern="[0-9]*" value={marcas[l.clave]} onChange={(e) => { setDestino(null); setMarcas({ ...marcas, [l.clave]: e.target.value.replace(/\D/g, '') }) }} aria-invalid={err ? true : undefined} data-testid="mover-cantidad" />
                        {Number(marcas[l.clave]) !== l.disponible && <button type="button" className="btn-secondary btn-sm" onClick={() => { setDestino(null); setMarcas({ ...marcas, [l.clave]: String(l.disponible) }) }} data-testid="mover-linea-todo">Todo ({l.disponible})</button>}
                        {err && <p role="alert" className="w-full text-sm text-red-700" data-testid="mover-error-cantidad">{err}</p>}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      )}

      {/* 3 · Destino */}
      {origen && marcadas.length > 0 && (
        <section aria-labelledby="h-destino" className="space-y-3">
          <h2 id="h-destino" className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">¿A dónde va?</h2>
          {!destino ? (
            <>
              <Buscador id="q-destino" etiqueta="Ubicación de destino" ayuda="Escribe el código. Te avisamos al instante si no sirve para lo que marcaste." valor={qDestino} onCambio={setQDestino} testid="mover-buscar-destino" />
              <div aria-live="polite" className="min-h-6 text-sm text-gray-600">{destinos.cargando ? 'Buscando…' : destinos.resultados && destinos.resultados.length === 0 ? 'Ninguna ubicación coincide.' : ''}</div>
              <ul className="space-y-2" data-testid="mover-resultados-destino">
                {(destinos.resultados ?? []).map((r) => (
                  <li key={r.posicionId}>
                    <button type="button" onClick={() => elegirDestino(r)} className="flex min-h-14 w-full items-center gap-3 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-left hover:border-gray-400 active:bg-gray-50" data-testid="mover-destino">
                      <span className="tabular font-heading text-lg font-semibold tracking-wide text-gray-900">{r.codigo}</span>
                      <span className="min-w-0 flex-1 text-sm text-gray-600">{r.area}{r.ocupadas ? ` · ${r.ocupadas} u` : ' · libre'}</span>
                      {r.invalidas === 0 ? <span className="inline-flex items-center gap-1 text-sm text-green-800"><CheckCircle2 className="h-4 w-4" aria-hidden />Sirve</span>
                        : <span className="inline-flex items-center gap-1 text-sm text-amber-900"><TriangleAlert className="h-4 w-4" aria-hidden />{r.general ? 'No disponible' : `No sirve para ${r.invalidas} de ${marcadas.length}`}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="space-y-3" data-testid="mover-destino-elegido">
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-300 bg-white px-4 py-3">
                <ArrowRight className="h-5 w-5 text-gray-500" aria-hidden />
                <span className="tabular font-heading text-xl font-semibold tracking-wide text-gray-900">{destino.codigo}</span>
                <span className="text-sm text-gray-600">{destino.area}</span>
                <button type="button" className="btn-secondary btn-sm ml-auto" onClick={() => { setDestino(null); setQDestino('') }} data-testid="mover-cambiar-destino"><X className="h-4 w-4" aria-hidden />Cambiar</button>
              </div>
              {destino.ok ? (
                <Aviso tipo="ok" testid="mover-destino-ok">{destino.codigo} recibe las {destino.validas} {destino.validas === 1 ? 'línea' : 'líneas'} que marcaste.</Aviso>
              ) : (
                <div className="space-y-2" data-testid="mover-destino-problemas">
                  <Aviso tipo="atencion">{destino.general ?? (destino.validas === 0 ? `${destino.codigo} no recibe ${destino.porLinea.length === 1 ? 'esta línea' : `ninguna de las ${destino.porLinea.length} líneas`}.` : `${destino.codigo} no recibe ${destino.invalidas} de las ${destino.porLinea.length} líneas.`)}</Aviso>
                  {!destino.general && (
                    <ul className="space-y-1.5">
                      {destino.porLinea.filter((x) => !x.ok).map((x) => { const l = lineas.find((q) => q.clave === x.clave)!; return (
                        <li key={x.clave} className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950" data-testid="mover-linea-problema"><strong>{l.producto}</strong> · lote {l.lote}: {x.mensaje}</li>
                      ) })}
                    </ul>
                  )}
                  {!destino.general && destino.validas > 0 && <button type="button" className="btn-secondary btn-sm" onClick={quitarQueNoCaben} data-testid="mover-quitar-no-caben">Quitar las que no caben ({destino.invalidas})</button>}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* 4 · Motivo */}
      {origen && marcadas.length > 0 && destino?.ok && (
        <section aria-labelledby="h-motivo" className="space-y-3">
          <h2 id="h-motivo" className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">¿Por qué se mueve?</h2>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Motivos frecuentes">
            {MOTIVOS.map((m) => <button key={m} type="button" aria-pressed={motivo === m} onClick={() => setMotivo(m)} className={`min-h-11 rounded-full border px-4 text-sm font-medium ${motivo === m ? PILDORA_ACTIVA : PILDORA_INACTIVA_HOVER}`} data-testid="mover-motivo-rapido">{m}</button>)}
          </div>
          <div><label htmlFor="mover-motivo" className="etiqueta">O escríbelo</label><input id="mover-motivo" className="campo" value={motivo} onChange={(e) => setMotivo(e.target.value)} autoComplete="off" data-testid="mover-motivo" /></div>
        </section>
      )}

      {mensaje && <Aviso tipo={mensaje.tipo === 'ok' ? 'ok' : 'error'}>{mensaje.texto}</Aviso>}

      {/* Acción principal, siempre a la vista (sobre la barra de navegación en el teléfono) */}
      <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 border-t border-gray-200 bg-white/95 px-4 py-3 backdrop-blur md:bottom-0 md:left-16 xl:left-60" data-testid="mover-barra">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-4 gap-y-2">
          <p className="tabular min-w-0 flex-1 text-sm text-gray-800" aria-live="polite" data-testid="mover-resumen">
            {marcadas.length > 0 ? <><strong>{marcadas.length} {marcadas.length === 1 ? 'línea' : 'líneas'} · {total.toLocaleString('es-PE')} u</strong>{origen && destino ? ` · ${origen.codigo} → ${destino.codigo}` : origen ? ` · desde ${origen.codigo}` : ''}</> : 'Nada marcado todavía.'}
            {falta && <span className="block text-xs text-gray-600" data-testid="mover-falta">{falta}</span>}
          </p>
          <button type="button" className="btn-primary w-full sm:w-auto" disabled={pendiente || !!falta} onClick={preparar} data-testid="mover-preparar"><Send className="h-5 w-5" aria-hidden />{pendiente ? 'Preparando…' : 'Preparar el movimiento'}</button>
        </div>
      </div>
    </div>
  )
}
