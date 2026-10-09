'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { ArrowLeftRight, Boxes, CornerDownLeft, FileText, Layers, MapPin, Search, SearchX, ShoppingCart, X } from 'lucide-react'
import { buscarAccion } from '@/app/acciones'
import type { ResultadoBusqueda, TipoResultado } from '@/domain/panorama'

const ICONO: Record<TipoResultado, typeof Boxes> = { producto: Boxes, lote: Layers, posicion: MapPin, oc: ShoppingCart, acta: FileText, movimiento: ArrowLeftRight }
const TITULO_GRUPO: Record<TipoResultado, string> = { producto: 'Productos', lote: 'Lotes', posicion: 'Ubicaciones', oc: 'Órdenes de compra', acta: 'Actas', movimiento: 'Movimientos' }

/** Búsqueda universal (Ctrl/Cmd+K): producto, lote, ubicación, movimiento (MI-AAAA-NNNNN), orden de compra y acta. */
export function PaletaBusqueda({ onCerrar }: { onCerrar: () => void }) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [resultados, setResultados] = useState<ResultadoBusqueda[] | null>(null)
  const [error, setError] = useState(false)
  const [sel, setSel] = useState(0)
  const [pendiente, empezar] = useTransition()
  const input = useRef<HTMLInputElement>(null)
  const ultima = useRef(0)

  useEffect(() => input.current?.focus(), [])

  // Debounce + descarte de respuestas viejas (la última consulta manda).
  useEffect(() => {
    if (!q.trim()) { setResultados(null); setError(false); return }
    const id = ++ultima.current
    const t = setTimeout(() => {
      empezar(async () => {
        try {
          const r = await buscarAccion(q)
          if (id === ultima.current) { setResultados(r); setSel(0); setError(false) }
        } catch {
          if (id === ultima.current) setError(true)
        }
      })
    }, 180)
    return () => clearTimeout(t)
  }, [q])

  const lista = resultados ?? []
  const ir = (r: ResultadoBusqueda) => {
    onCerrar()
    router.push(r.href)
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onCerrar()
    else if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, lista.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)) }
    else if (e.key === 'Enter' && lista[sel]) { e.preventDefault(); ir(lista[sel]) }
  }

  const grupos = (['producto', 'lote', 'posicion', 'movimiento', 'oc', 'acta'] as const)
    .map((t) => ({ t, filas: lista.map((r, i) => ({ r, i })).filter(({ r }) => r.tipo === t) }))
    .filter((g) => g.filas.length > 0)

  const totalUnidades = lista.filter((r) => r.tipo === 'producto').reduce((n, r) => n + r.unidades, 0)

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center p-0 md:p-4 md:pt-[10vh]" role="dialog" aria-modal="true" aria-label="Búsqueda">
      <button type="button" className="absolute inset-0 bg-gray-900/40" aria-label="Cerrar búsqueda" onClick={onCerrar} />
      <div className="panel-entra relative flex h-full w-full flex-col overflow-hidden bg-white shadow-xl md:h-auto md:max-h-[75vh] md:max-w-2xl md:rounded-xl">
        <div className="flex items-center gap-2 border-b border-gray-200 px-4">
          <Search className="h-5 w-5 shrink-0 text-gray-500" aria-hidden />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            role="combobox"
            aria-expanded={lista.length > 0}
            aria-controls="resultados-busqueda"
            aria-label="Buscar producto, lote o ubicación"
            placeholder="Producto, lote o ubicación (por ejemplo: dapagliflozina, ABC, A-10.2)"
            className="min-h-14 flex-1 bg-transparent text-base text-gray-900 placeholder:text-gray-500 focus:outline-none focus:shadow-none"
            autoComplete="off"
            spellCheck={false}
          />
          <button type="button" onClick={onCerrar} className="flex h-11 w-11 items-center justify-center rounded-full text-gray-600 hover:bg-gray-100" aria-label="Cerrar">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div id="resultados-busqueda" role="listbox" className="flex-1 overflow-y-auto p-2" data-testid="resultados-busqueda">
          {!q.trim() && (
            <div className="px-3 py-8 text-center text-sm text-gray-600">
              <p className="font-medium text-gray-800">Escribe lo que buscas</p>
              <p className="mt-1">Te decimos dónde está y cuántas unidades hay. Las órdenes de compra y las actas se podrán buscar cuando lleguen las entradas.</p>
            </div>
          )}
          {error && (
            <p role="alert" className="px-3 py-8 text-center text-sm text-gray-700">
              No pudimos buscar en este momento. Revisa tu conexión e intenta de nuevo.
            </p>
          )}
          {q.trim() && resultados && resultados.length === 0 && !error && (
            <div className="px-3 py-8 text-center text-sm text-gray-600" data-testid="busqueda-vacia">
              <SearchX className="mx-auto mb-2 h-8 w-8 text-gray-400" aria-hidden />
              <p className="font-medium text-gray-800">No encontramos “{q.trim()}”</p>
              <p className="mt-1">Prueba con otra parte del nombre, el código del lote o una ubicación como A-10.2.</p>
            </div>
          )}
          {q.trim() && !resultados && !error && (
            <p className="px-3 py-8 text-center text-sm text-gray-600" aria-live="polite">Buscando…</p>
          )}
          {grupos.map((g) => (
            <div key={g.t} className="mb-2">
              <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{TITULO_GRUPO[g.t]}</p>
              {g.filas.map(({ r, i }) => {
                const Icono = ICONO[r.tipo]
                return (
                  <Link
                    key={`${r.tipo}-${r.id}`}
                    href={r.href}
                    role="option"
                    aria-selected={i === sel}
                    onClick={onCerrar}
                    onMouseEnter={() => setSel(i)}
                    className={`flex min-h-14 items-center gap-3 rounded-md px-3 py-2 ${i === sel ? 'bg-green-50' : ''}`}
                  >
                    <Icono className="h-5 w-5 shrink-0 text-gray-500" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-gray-900">{r.titulo}</span>
                      <span className="block truncate text-xs text-gray-600">{r.detalle}</span>
                    </span>
                    {i === sel && <CornerDownLeft className="hidden h-4 w-4 shrink-0 text-gray-500 md:block" aria-hidden />}
                  </Link>
                )
              })}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-gray-200 bg-gray-50 px-4 py-2 text-xs text-gray-600" aria-live="polite">
          <span>{pendiente ? 'Buscando…' : resultados && resultados.length > 0 ? `${resultados.length} ${resultados.length === 1 ? 'resultado' : 'resultados'}${totalUnidades ? ` · ${totalUnidades.toLocaleString('es-PE')} unidades en productos` : ''}` : 'Ctrl K para abrir · Esc para cerrar'}</span>
          <span className="hidden md:inline">↑ ↓ para moverte · Enter para abrir</span>
        </div>
      </div>
    </div>
  )
}
