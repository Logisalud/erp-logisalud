'use client'

import { useEffect, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { buscarProductosSalidaAccion } from '@/app/acciones-salida-manual'
import type { ProductoHallado } from '@/domain/salida-manual'

/**
 * Busca el producto escribiendo su nombre, su código o cualquiera de sus otros códigos (barras, del cliente, del proveedor); la búsqueda va al servidor porque el catálogo real
 * tiene cientos de productos. Con debounce y descarte de respuestas viejas. Con `propietarioId`, también encuentra el código propio de ese cliente.
 */
export function SelectorProductoSalida({ valor, onElegir, id, propietarioId, error }: { valor: ProductoHallado | null; onElegir: (p: ProductoHallado | null) => void; id: string; propietarioId?: string; error?: string }) {
  const [q, setQ] = useState('')
  const [opciones, setOpciones] = useState<ProductoHallado[]>([])
  const [abierto, setAbierto] = useState(false)
  const [cargando, setCargando] = useState(false)
  const ultima = useRef(0)

  useEffect(() => {
    if (q.trim().length < 2) { setOpciones([]); setCargando(false); return }
    const n = ++ultima.current
    setCargando(true)
    const t = setTimeout(async () => {
      const r = await buscarProductosSalidaAccion(q, propietarioId)
      if (n === ultima.current) { setOpciones(r); setCargando(false) }
    }, 200)
    return () => clearTimeout(t)
  }, [q, propietarioId])

  if (valor) {
    return (
      <div className="flex min-h-12 items-center justify-between gap-2 rounded-md border border-gray-300 bg-gray-50 px-3" data-testid="producto-elegido">
        <span className="min-w-0 text-sm"><span className="block truncate font-medium text-gray-900">{valor.descripcion}</span><span className="block truncate text-xs text-gray-600">{valor.codigo}{valor.presentacion ? ` · ${valor.presentacion}` : ''}</span></span>
        <button type="button" onClick={() => onElegir(null)} aria-label={`Quitar ${valor.descripcion}`} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-700 hover:bg-gray-200"><X className="h-4 w-4" aria-hidden /></button>
      </div>
    )
  }
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" aria-hidden />
      <input id={id} value={q} onChange={(e) => { setQ(e.target.value); setAbierto(true) }} onFocus={() => setAbierto(true)} onBlur={() => setTimeout(() => setAbierto(false), 150)}
        placeholder="Nombre o cualquier código del producto" role="combobox" aria-expanded={abierto && opciones.length > 0} aria-controls={`${id}-lista`} aria-autocomplete="list" autoComplete="off"
        className={`campo pl-9 ${error ? '!border-red-500' : ''}`} aria-invalid={error ? true : undefined} data-testid="buscar-producto-salida" />
      {abierto && q.trim().length >= 2 && (
        <ul id={`${id}-lista`} role="listbox" className="absolute z-20 mt-1 max-h-64 w-full min-w-[18rem] overflow-auto rounded-md border border-gray-200 bg-white shadow-lg">
          {opciones.length === 0 ? <li className="px-3 py-3 text-sm text-gray-600">{cargando ? 'Buscando…' : 'No encontramos ese producto. ¿Está dado de alta?'}</li>
            : opciones.map((o) => (
              <li key={o.id} role="option" aria-selected={false}>
                <button type="button" data-testid="opcion-producto-salida" onMouseDown={(e) => e.preventDefault()} onClick={() => { onElegir(o); setQ(''); setAbierto(false) }} className="flex min-h-12 w-full flex-col items-start justify-center px-3 py-2 text-left text-sm hover:bg-gray-50">
                  <span className="font-medium text-gray-900">{o.descripcion}</span>
                  <span className="text-xs text-gray-600">{o.codigo}{o.presentacion ? ` · ${o.presentacion}` : ''}</span>
                  {o.coincidencia && <span className="text-xs font-medium text-teal-800">Lo encontramos por su {o.coincidencia}</span>}
                </button>
              </li>
            ))}
        </ul>
      )}
    </div>
  )
}
