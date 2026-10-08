'use client'

import { useEffect, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { buscarProductosAccion } from '@/app/acciones-entradas'

export interface ProductoElegido { id: string; codigo: string; descripcion: string; presentacion?: string }

/** Búsqueda de producto contra el servidor (el catálogo real tiene unos 500: no se precarga). Con debounce y descarte de respuestas viejas. */
export function SelectorProducto({ valor, onElegir, id, error }: { valor: ProductoElegido | null; onElegir: (p: ProductoElegido | null) => void; id: string; error?: string }) {
  const [q, setQ] = useState('')
  const [opciones, setOpciones] = useState<ProductoElegido[]>([])
  const [abierto, setAbierto] = useState(false)
  const [cargando, setCargando] = useState(false)
  const ultima = useRef(0)

  useEffect(() => {
    if (q.trim().length < 2) { setOpciones([]); return }
    const n = ++ultima.current
    setCargando(true)
    const t = setTimeout(async () => {
      const r = await buscarProductosAccion(q)
      if (n === ultima.current) { setOpciones(r); setCargando(false) }
    }, 200)
    return () => clearTimeout(t)
  }, [q])

  if (valor) {
    return (
      <div className="flex min-h-12 items-center justify-between gap-2 rounded-md border border-gray-300 bg-gray-50 px-3">
        <span className="min-w-0 text-sm"><span className="block truncate font-medium text-gray-900">{valor.descripcion}</span><span className="block truncate text-xs text-gray-600">{valor.codigo}{valor.presentacion ? ` · ${valor.presentacion}` : ''}</span></span>
        <button type="button" onClick={() => onElegir(null)} aria-label={`Quitar ${valor.descripcion}`} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-700 hover:bg-gray-200"><X className="h-4 w-4" aria-hidden /></button>
      </div>
    )
  }
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" aria-hidden />
      <input id={id} value={q} onChange={(e) => { setQ(e.target.value); setAbierto(true) }} onFocus={() => setAbierto(true)} onBlur={() => setTimeout(() => setAbierto(false), 150)}
        placeholder="Busca el producto por nombre o código" role="combobox" aria-expanded={abierto && opciones.length > 0} aria-controls={`${id}-lista`} aria-autocomplete="list" autoComplete="off"
        className={`campo pl-9 ${error ? '!border-red-500' : ''}`} aria-invalid={error ? true : undefined} />
      {abierto && q.trim().length >= 2 && (
        <ul id={`${id}-lista`} role="listbox" className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-gray-200 bg-white shadow-lg">
          {opciones.length === 0 ? <li className="px-3 py-3 text-sm text-gray-600">{cargando ? 'Buscando…' : 'No encontramos ese producto. ¿Está dado de alta?'}</li>
            : opciones.map((o) => (
              <li key={o.id} role="option" aria-selected={false}>
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onElegir(o); setQ(''); setAbierto(false) }} className="flex min-h-12 w-full flex-col items-start justify-center px-3 py-2 text-left text-sm hover:bg-gray-50">
                  <span className="font-medium text-gray-900">{o.descripcion}</span><span className="text-xs text-gray-600">{o.codigo}{o.presentacion ? ` · ${o.presentacion}` : ''}</span>
                </button>
              </li>
            ))}
        </ul>
      )}
    </div>
  )
}
