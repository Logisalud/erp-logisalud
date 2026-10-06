'use client'

import { useEffect, useRef, useState } from 'react'

export type ProductoElegido = {
  id: string
  codigo: string
  descripcion: string
  unidad_medida: string
  /** Precio de compra cargado en el catálogo (catalogo.productos.precio_compra)
   * — null si todavía no se cargó para este producto. Sirve para
   * autocompletar el precio unitario de la línea, nunca para forzarlo. */
  precio_compra: number | null
  /** El producto no lleva IGV (migración 0078). Solo para que el total que se
   * ve mientras se arma la OC sea el real: el servidor vuelve a leerlo de la
   * base al guardar y no confía en este valor. */
  exonerado_igv?: boolean
}

/**
 * Combobox de producto con búsqueda en el servidor.
 *
 * No es un <select>: el catálogo tiene 162 productos hoy y va a crecer, y un
 * <select> obliga a precargarlo entero (PostgREST corta las respuestas en
 * 1.000 filas). Mismo criterio que el combobox de apps/pedidos.
 *
 * Trae debounce y descarte de respuestas viejas: sin eso, al teclear rápido la
 * respuesta de "para" puede llegar después de la de "paracetamol" y pisar la
 * lista con resultados que no corresponden a lo que se ve escrito.
 */
export function BuscadorProducto({
  valor,
  onElegir,
}: {
  valor: ProductoElegido | null
  onElegir: (p: ProductoElegido | null) => void
}) {
  const [termino, setTermino] = useState('')
  const [opciones, setOpciones] = useState<ProductoElegido[]>([])
  const [buscando, setBuscando] = useState(false)
  const [abierto, setAbierto] = useState(false)
  const pedidoActual = useRef(0)

  useEffect(() => {
    if (!termino.trim()) {
      setOpciones([])
      return
    }
    const miPedido = ++pedidoActual.current
    setBuscando(true)
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/api/productos?q=${encodeURIComponent(termino)}`)
        const json = await r.json()
        // Solo la respuesta del último tecleo puede pintar la lista.
        if (miPedido === pedidoActual.current) setOpciones(json.productos ?? [])
      } finally {
        if (miPedido === pedidoActual.current) setBuscando(false)
      }
    }, 250)
    return () => clearTimeout(t)
  }, [termino])

  if (valor) {
    return (
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm">
          <span className="font-mono text-xs text-gray-500">{valor.codigo}</span>
          <p>{valor.descripcion}</p>
          <p className="text-xs text-gray-500">
            {valor.unidad_medida}
            {valor.exonerado_igv ? (
              <span className="ml-2 rounded-full bg-sky-100 px-2 py-0.5 font-medium text-sky-800">
                Exonerado de IGV
              </span>
            ) : null}
          </p>
        </div>
        <button
          type="button"
          onClick={() => { onElegir(null); setTermino(''); setAbierto(false) }}
          className="shrink-0 text-sm text-logisalud-teal underline"
        >
          Cambiar
        </button>
      </div>
    )
  }

  return (
    <div className="relative">
      <input
        type="text"
        value={termino}
        onChange={(e) => { setTermino(e.target.value); setAbierto(true) }}
        onFocus={() => setAbierto(true)}
        placeholder="Buscar por código o descripción…"
        className="min-h-12 w-full rounded-md border border-gray-300 px-3"
      />
      {abierto && termino.trim() ? (
        <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-md border border-gray-200 bg-white shadow-md">
          {buscando && opciones.length === 0 ? (
            <li className="px-3 py-2 text-sm text-gray-500">Buscando…</li>
          ) : opciones.length === 0 ? (
            <li className="px-3 py-2 text-sm text-gray-500">Nada coincide.</li>
          ) : (
            opciones.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => { onElegir(p); setAbierto(false); setTermino('') }}
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
                >
                  <span className="font-mono text-xs text-gray-500">{p.codigo}</span>
                  <span className="ml-2">{p.descripcion}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  )
}
