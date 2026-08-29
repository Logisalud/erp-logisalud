'use client'

import { useEffect, useRef, useState } from 'react'

export type ProveedorElegido = {
  id: string
  nombre: string
  condicionPagoDias: number
  moneda: string
}

/**
 * Combobox de proveedor con búsqueda en el servidor por RUC o razón social.
 *
 * No es un <select>: mismo criterio que BuscadorProducto — la cartera de
 * proveedores va a seguir creciendo y un <select> obliga a precargarla
 * entera. Trae debounce y descarte de respuestas viejas.
 */
export function BuscadorProveedor({
  valor,
  onElegir,
  tipo,
}: {
  valor: ProveedorElegido | null
  onElegir: (p: ProveedorElegido | null) => void
  tipo?: 'mercaderia' | 'bien'
}) {
  const [termino, setTermino] = useState('')
  const [opciones, setOpciones] = useState<ProveedorElegido[]>([])
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
        const params = new URLSearchParams({ q: termino })
        if (tipo) params.set('tipo', tipo)
        const r = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/api/proveedores?${params}`)
        const json = await r.json()
        if (miPedido === pedidoActual.current) setOpciones(json.proveedores ?? [])
      } finally {
        if (miPedido === pedidoActual.current) setBuscando(false)
      }
    }, 250)
    return () => clearTimeout(t)
  }, [termino, tipo])

  if (valor) {
    return (
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm">{valor.nombre}</p>
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
        placeholder="Buscar por RUC o razón social…"
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
                  {p.nombre}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  )
}
