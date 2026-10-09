'use client'

import { useEffect, useRef } from 'react'
import { Info, MapPin, X } from 'lucide-react'
import { formatoFecha } from '@/domain/fechas'
import { normalizar } from '@/domain/busqueda'
import { AREAS_COMPARTIDAS } from '@/domain/zonas'
import type { CeldaVista, FilaStockVista, PosicionVista } from '@/domain/vista-mapa'
import { vistaPropietario } from '../propietarios-color'
import { ChipEnTransito, ChipEstado, ChipPorTrasladar, ChipPorVerificar } from '../chips'

function titulo(p: PosicionVista): string {
  if (p.forma === 'SUBRACK') return `Subrack ${p.subnivel}`
  if (p.forma === 'RACK') return `Nivel ${p.nivel}`
  if (p.forma === 'MESA') return 'Mesa'
  return 'Piso'
}

function coincideFila(f: FilaStockVista, codigo: string, consulta: string) {
  const q = normalizar(consulta)
  if (!q) return false
  const t = normalizar(`${f.producto} ${f.productoCodigo} ${f.lote} ${codigo} ${f.propietario}`)
  return q.split(/\s+/).filter(Boolean).every((w) => t.includes(w))
}

function Fila({ f, resaltar }: { f: FilaStockVista; resaltar: boolean }) {
  const v = vistaPropietario(f.propietario)
  return (
    <li className={`rounded-md border px-3 py-2.5 ${resaltar ? 'border-teal-400 bg-teal-50' : 'border-gray-200 bg-white'}`} data-testid="fila-stock">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900">{f.producto}</p>
          <p className="tabular text-xs text-gray-600">
            Lote {f.lote} · vence {formatoFecha(f.vence)}
          </p>
        </div>
        <p className="tabular shrink-0 text-right">
          <span className="block font-heading text-xl font-semibold text-gray-900">{f.cantidad.toLocaleString('es-PE')}</span>
          <span className="block text-[11px] text-gray-600">unidades</span>
        </p>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <ChipEstado estado={f.estado} />
        {f.porTrasladar && <ChipPorTrasladar />}
        <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-700">
          <span aria-hidden className="flex h-4 w-4 items-center justify-center rounded text-[10px] font-bold text-white" style={{ background: v.color }}>{v.letra}</span>
          {v.corto}
        </span>
      </div>
    </li>
  )
}

function Nivel({ p, consulta }: { p: PosicionVista; consulta: string }) {
  const total = p.stock.reduce((n, s) => n + s.cantidad, 0)
  const compartida = AREAS_COMPARTIDAS.has(p.tipoArea)
  return (
    <section className="rounded-lg border border-gray-200 bg-gray-50 p-3" aria-label={`${p.codigo}`} data-testid="nivel">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h3 className="font-heading text-base font-semibold uppercase tracking-wide text-gray-900">{titulo(p)}</h3>
          <span className="tabular text-xs text-gray-600">{p.codigo}</span>
        </div>
        <span className="text-xs font-medium text-gray-700">{p.areaEtiqueta}</span>
      </header>

      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-700">
        {p.asignacion ? (
          <>
            <span aria-hidden className="flex h-4 w-4 items-center justify-center rounded text-[10px] font-bold text-white" style={{ background: vistaPropietario(p.asignacion.propietario).color }}>{vistaPropietario(p.asignacion.propietario).letra}</span>
            <span>Asignada a <strong>{vistaPropietario(p.asignacion.propietario).corto}</strong> desde {formatoFecha(p.asignacion.desde)}</span>
            {p.asignacion.documento && <span className="text-gray-600">· {p.asignacion.documento}</span>}
            {p.asignacion.porConfirmar && <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-amber-900">Firma por confirmar</span>}
          </>
        ) : compartida ? (
          <span>Área compartida: varios propietarios a la vez.</span>
        ) : (
          <span>Libre: sin propietario asignado.</span>
        )}
      </p>
      {p.porVerificar && (
        <p className="mt-2 flex items-start gap-2 text-xs text-amber-900">
          <ChipPorVerificar />
          {p.nota && <span className="pt-0.5">{p.nota}</span>}
        </p>
      )}

      {p.transito && (
        <div className="mt-2 flex flex-col gap-1" data-testid="transito-posicion">
          {p.transito.salen > 0 && <p className="flex items-center gap-2 text-xs text-teal-900"><ChipEnTransito unidades={p.transito.salen} /><span>salen de aquí</span></p>}
          {p.transito.llegan > 0 && <p className="flex items-center gap-2 text-xs text-teal-900"><ChipEnTransito unidades={p.transito.llegan} /><span>llegan aquí</span></p>}
        </div>
      )}

      {p.stock.length === 0 ? (
        <p className="mt-3 rounded-md border border-dashed border-gray-300 bg-white px-3 py-4 text-center text-sm text-gray-600">Vacía. No hay nada guardado aquí.</p>
      ) : (
        <>
          <ul className="mt-3 space-y-2">
            {p.stock.map((f, i) => <Fila key={i} f={f} resaltar={coincideFila(f, p.codigo, consulta)} />)}
          </ul>
          {p.stock.length > 1 && <p className="tabular mt-2 text-right text-xs text-gray-600">{total.toLocaleString('es-PE')} unidades en {p.stock.length} lotes</p>}
        </>
      )}
    </section>
  )
}

export function DrawerPosicion({ celda, consulta, onCerrar }: { celda: CeldaVista; consulta: string; onCerrar: () => void }) {
  const cerrar = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    cerrar.current?.focus()
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar() }
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [onCerrar])

  const subracks = celda.posiciones.filter((p) => p.forma === 'SUBRACK')
  const resto = celda.posiciones.filter((p) => p.forma !== 'SUBRACK')
  // Los subracks son el nivel 1 de esa posición: se agrupan en su lugar del frente del rack.
  const niveles = resto.map((p) => ({ nivel: p.nivel ?? 0, p })).sort((a, b) => b.nivel - a.nivel)
  const esRack = celda.posiciones.some((p) => p.forma === 'RACK' || p.forma === 'SUBRACK')
  const unidades = celda.posiciones.reduce((n, p) => n + p.stock.reduce((m, s) => m + s.cantidad, 0), 0)

  return (
    <div className="fixed inset-0 z-50 md:pointer-events-none" role="dialog" aria-modal="false" aria-label={`Ubicación ${celda.clave}`} data-testid="drawer-posicion">
      <button type="button" className="absolute inset-0 bg-gray-900/40 md:hidden" aria-label="Cerrar" onClick={onCerrar} />
      <aside className="hoja-entra md:panel-entra pointer-events-auto absolute inset-x-0 bottom-0 flex max-h-[90vh] flex-col rounded-t-xl border-gray-200 bg-white shadow-xl md:bottom-0 md:left-auto md:right-0 md:top-[var(--alto-banner)] md:max-h-none md:w-[440px] md:rounded-none md:border-l">
        <header className="flex items-start justify-between gap-3 border-b border-gray-200 px-5 py-4">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-gray-600"><MapPin className="h-3.5 w-3.5" aria-hidden />{esRack ? 'Rack · vista frontal' : 'Ubicación'}</p>
            <h2 className="font-heading text-3xl font-semibold tracking-wide text-gray-900">{celda.clave}</h2>
            <p className="tabular mt-0.5 text-sm text-gray-700">
              {unidades > 0 ? `${unidades.toLocaleString('es-PE')} unidades en ${celda.nivelesConStock} de ${celda.niveles} ${celda.niveles === 1 ? 'nivel' : 'niveles'}` : 'Vacía'}
            </p>
          </div>
          <button ref={cerrar} type="button" onClick={onCerrar} aria-label="Cerrar" data-testid="cerrar-drawer" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-700 hover:bg-gray-100">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </header>

        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {niveles.map(({ p }) => <Nivel key={p.codigo} p={p} consulta={consulta} />)}
          {subracks.length > 0 && (
            <section aria-label="Subracks del nivel 1">
              <h3 className="mb-2 font-heading text-base font-semibold uppercase tracking-wide text-gray-900">Nivel 1 · subracks</h3>
              <div className="space-y-3">
                {subracks.sort((a, b) => (a.subnivel ?? 0) - (b.subnivel ?? 0)).map((p) => <Nivel key={p.codigo} p={p} consulta={consulta} />)}
              </div>
            </section>
          )}
          <p className="flex items-start gap-2 pt-1 text-xs text-gray-600">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            Mover, contar y ver el historial llegan con los movimientos internos. Por ahora aquí solo consultas.
          </p>
        </div>
      </aside>
    </div>
  )
}
